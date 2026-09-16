use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs::File, io::{Read, Write}, path::Path};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

pub const EMBEDDED_MOD: &str = include_str!("../resources/RPGMToolkit.js");
pub const MAX_TEXT: u64 = 4 * 1024 * 1024;
const MAX_EXPANDED: u64 = 16 * 1024 * 1024 * 1024;
const MOD_PATH: &str = "js/plugins/RPGMToolkit.js";

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub title: String, pub engine: String, pub prefix: String, pub source_name: String,
    pub kind: String, pub status: String, pub plugin_count: usize, pub files: usize,
    pub size: u64, pub fingerprint: String, pub recovery_needed: bool,
}
#[derive(Clone, Debug)]
pub struct Snapshot { pub info: Inspection, pub registry: String, pub previous_mod: Option<String> }

pub fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
pub fn fingerprint(registry: &str, plugin: Option<&str>) -> String {
    let mut sha = Sha256::new(); sha.update(registry.as_bytes()); sha.update([0]);
    if let Some(plugin) = plugin { sha.update([1]); sha.update(plugin.as_bytes()); }
    else { sha.update([2]); } format!("{:x}",sha.finalize())
}
fn parse_registry(text: &str) -> Result<(String, Vec<Value>, String), String> {
    if text.len() as u64 > MAX_TEXT { return Err("La liste de plugins dépasse 4 Mo.".into()); }
    let re = Regex::new(r"(?s)\A(.*?\b(?:var|let|const)\s+\$plugins\s*=\s*)(\[.*\])((?:\s|;|//[^\r\n]*(?:\r?\n|\z)|/\*.*?\*/)*)\z").unwrap();
    let captures = re.captures(text).ok_or("Format de plugins.js non standard. Aucun changement effectué.")?;
    literal_depth(&captures[2])?;
    let entries: Vec<Value> = json5::from_str(&captures[2]).map_err(|e| format!("Liste de plugins illisible : {e}"))?;
    if entries.iter().any(|entry| entry.get("name").and_then(Value::as_str).is_none()) { return Err("Une entrée de plugins.js est invalide.".into()); }
    if entries.iter().filter(|e| e["name"].as_str().is_some_and(|n| n.eq_ignore_ascii_case("RPGMToolkit"))).count() > 1 { return Err("Plusieurs entrées RPGMToolkit existent. Corrigez le doublon avant de continuer.".into()); }
    Ok((captures[1].into(), entries, captures[3].into()))
}
fn literal_depth(s:&str)->Result<(),String>{
    let b=s.as_bytes();let mut i=0;let mut depth=0usize;let mut quote=0;
    while i<b.len(){let c=b[i];if quote!=0{if c==b'\\'{i+=1}else if c==quote{quote=0}}
        else if c==b'\''||c==b'"'{quote=c}
        else if c==b'/'&&b.get(i+1)==Some(&b'/'){i+=2;while i<b.len()&&b[i]!=b'\n'{i+=1}}
        else if c==b'/'&&b.get(i+1)==Some(&b'*'){i+=2;while i+1<b.len()&&!(b[i]==b'*'&&b[i+1]==b'/'){i+=1}i+=1;}
        else if c==b'['||c==b'{'{depth+=1;if depth>64{return Err("Paramètres de plugins trop imbriqués.".into())}}
        else if c==b']'||c==b'}'{depth=depth.saturating_sub(1)}i+=1;
    }Ok(())
}
pub fn inspect_text(registry: String, previous_mod: Option<String>, mut info: Inspection) -> Result<Snapshot, String> {
    let (_, entries, _) = parse_registry(&registry)?;
    let installed = entries.iter().find(|e| e["name"] == "RPGMToolkit");
    info.status = match (installed, previous_mod.is_some()) {
        (Some(e), true) if e["status"] == true => "installed",
        (Some(_), true) => "disabled", (None, false) => "absent", _ => "incomplete"
    }.into();
    info.plugin_count = entries.len(); info.fingerprint = fingerprint(&registry, previous_mod.as_deref());
    Ok(Snapshot { info, registry, previous_mod })
}
pub fn patch_registry(registry: &str, uninstall: bool) -> Result<String, String> {
    let (prefix, mut entries, suffix) = parse_registry(registry)?;
    let current = entries.iter().find(|e| e["name"] == "RPGMToolkit").cloned();
    // An ambiguous casing is refused, not silently converted into two loaded plugins.
    if entries.iter().any(|e| e["name"].as_str().is_some_and(|n| n.eq_ignore_ascii_case("RPGMToolkit") && n != "RPGMToolkit")) { return Err("Une entrée utilise une casse différente de RPGMToolkit. Renommez-la dans le gestionnaire de plugins.".into()); }
    entries.retain(|e| e["name"] != "RPGMToolkit");
    if !uninstall {
        let mut plugin = current.unwrap_or_else(|| json!({"name":"RPGMToolkit","description":"RPGM Toolkit 1.0.1","parameters":{"Hotkey":"F6","ShowButton":"true","PlaytestOnly":"false","PageSize":"60"}}));
        plugin["status"] = json!(true);
        entries.push(plugin);
    }
    Ok(format!("{}{}{}", prefix, serde_json::to_string_pretty(&entries).map_err(|e|e.to_string())?, suffix))
}
pub fn patch_snapshot(snapshot:&Snapshot,uninstall:bool)->Result<String,String>{
    if crate::rgss::legacy(&snapshot.info.engine) {crate::rgss::patch(&snapshot.registry,uninstall)} else {patch_registry(&snapshot.registry,uninstall)}
}
fn valid_name(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('/') && !name.contains(['\\', '\0', ':']) &&
    name.trim_end_matches('/').split('/').all(|s| !s.is_empty() && s != ".." && s != ".")
}
fn open_zip(path: &Path) -> Result<ZipArchive<File>, String> {
    let mut zip = ZipArchive::new(File::open(path).map_err(|e| e.to_string())?).map_err(|_| "ZIP non reconnu ou endommagé.")?;
    if zip.len() > 100_000 { return Err("ZIP trop volumineux : maximum 100 000 entrées.".into()); }
    let mut names = HashSet::new(); let mut expanded = 0u64;
    for i in 0..zip.len() {
        let file = zip.by_index(i).map_err(|_| "ZIP chiffré ou entrée illisible.")?;
        if !valid_name(file.name()) || !names.insert(file.name().to_lowercase()) { return Err("ZIP refusé : chemin dangereux ou entrée en double.".into()); }
        let mode = file.unix_mode().unwrap_or(0) & 0o170000;
        if mode != 0 && mode != 0o100000 && mode != 0o040000 { return Err("Les liens et fichiers spéciaux ne sont pas acceptés dans les ZIP.".into()); }
        expanded = expanded.saturating_add(file.size());
        if expanded > MAX_EXPANDED { return Err("Le contenu décompressé dépasse 16 Go.".into()); }
    }
    Ok(zip)
}
fn read_text(zip: &mut ZipArchive<File>, name: &str) -> Result<Option<String>, String> {
    match zip.by_name(name) {
        Ok(file) => {
            if file.size() > MAX_TEXT { return Err(format!("{name} dépasse 4 Mo.")); }
            let mut value = String::new(); file.take(MAX_TEXT + 1).read_to_string(&mut value).map_err(|_|format!("{name} n'est pas un texte UTF-8 valide."))?;
            if value.len() as u64 > MAX_TEXT { return Err("Texte trop volumineux.".into()); } Ok(Some(value))
        },
        Err(zip::result::ZipError::FileNotFound) => Ok(None), Err(e) => Err(e.to_string()),
    }
}
fn zip_bytes(zip:&mut ZipArchive<File>,name:&str)->Result<Vec<u8>,String>{
    let mut file=zip.by_name(name).map_err(|_|format!("Fichier absent : {name}"))?;
    if file.size()>crate::rgss::LIMIT as u64{return Err(format!("{name} dépasse 16 Mo."))}
    let mut data=Vec::new();file.read_to_end(&mut data).map_err(|e|e.to_string())?;Ok(data)
}
fn inspect_rgss_zip(zip:&mut ZipArchive<File>,names:&HashSet<String>,prefix:&str,source:&str,path:&Path)->Result<Snapshot,String>{
    use crate::rgss;
    let ini=zip_bytes(zip,&format!("{prefix}Game.ini"))?;
    let original_path=format!("{prefix}RPGMToolkit/original-game.ini");
    let original=if names.contains(&original_path){zip_bytes(zip,&original_path)?}else{ini.clone()};
    let (script_path,engine)=rgss::script_path(&ini)?;
    if rgss::script_path(&original)?.0.starts_with("RPGMToolkit/"){return Err("Copie originale de Game.ini absente.".into())}
    let ext=match engine.as_str(){"XP"=>".rgssad","VX"=>".rgss2a",_=>".rgss3a"};
    let archives:Vec<_>=names.iter().filter(|n|n.strip_prefix(prefix).is_some_and(|s|!s.contains('/')&&s.to_lowercase().ends_with(ext))).collect();
    if archives.len()>1{return Err("Plusieurs archives RGSS : moteur ambigu.".into())}
    let scripts=if !script_path.starts_with("RPGMToolkit/")&&!archives.is_empty(){
        let mut archive=zip.by_name(archives[0]).map_err(|e|e.to_string())?;
        crate::rgss_archive::extract(&mut archive,&script_path)?
    }else{
        let full=format!("{prefix}{script_path}");
        let actual=names.iter().find(|n|n.eq_ignore_ascii_case(&full)).ok_or("Scripts RGSS absents.")?;
        zip_bytes(zip,actual)?
    };
    if !names.contains(&original_path)&&names.iter().any(|n|n.starts_with(&format!("{prefix}RPGMToolkit/"))&&!n.ends_with('/')){return Err("Dossier RPGMToolkit déjà utilisé.".into())}
    let title=String::from_utf8_lossy(&original).lines().find_map(|l|l.split_once('=').filter(|(k,_)|k.trim().eq_ignore_ascii_case("Title")).map(|(_,v)|v.trim().to_string())).unwrap_or_else(||source.into());
    let info=Inspection{title,engine,prefix:prefix.into(),source_name:source.into(),kind:"zip".into(),status:String::new(),plugin_count:0,files:zip.len(),size:path.metadata().map_err(|e|e.to_string())?.len(),fingerprint:String::new(),recovery_needed:false};
    rgss::inspect(rgss::bundle(&ini,&original,&scripts),info)
}
fn transform_rgss_zip(input:&Path,output:&Path,snapshot:&Snapshot,uninstall:bool,progress:impl Fn(usize,usize))->Result<(),String>{
    use crate::rgss;
    let result=(||{
        let patched=rgss::patch(&snapshot.registry,uninstall)?;
        let (ini,original,scripts)=rgss::fields(&patched)?;
        let prefix=&snapshot.info.prefix;let ini_path=format!("{prefix}Game.ini");
        let script_path=format!("{prefix}{}",rgss::target(&original)?);let original_path=format!("{prefix}RPGMToolkit/original-game.ini");
        let mut source=open_zip(input)?;let count=source.len();let mut writer=ZipWriter::new(File::create(output).map_err(|e|e.to_string())?);
        for i in 0..count{let file=source.by_index(i).map_err(|e|e.to_string())?;
            if file.name()!=ini_path&&file.name()!=script_path&&file.name()!=original_path&&!(uninstall&&file.name()==format!("{prefix}RPGMToolkit/")){writer.raw_copy_file(file).map_err(|e|e.to_string())?;}
            if i%50==0||i+1==count{progress(i+1,count)}
        }
        let options=SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).unix_permissions(0o644);
        let mut write=|name:String,data:&[u8]|->Result<(),String>{writer.start_file(name,options).map_err(|e|e.to_string())?;writer.write_all(data).map_err(|e|e.to_string())};
        let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
        write(format!("{prefix}.rpgm-toolkit-backups/{stamp}/state.json"),snapshot.registry.as_bytes())?;
        write(ini_path,&ini)?;
        if !uninstall{write(script_path,&scripts)?;write(original_path,&original)?;}
        writer.finish().map_err(|e|e.to_string())?.sync_all().map_err(|e|e.to_string())?;
        let checked=inspect_zip(output,&snapshot.info.source_name)?;
        if checked.info.status!=if uninstall{"absent"}else{"installed"}||(!uninstall&&checked.previous_mod.as_deref()!=Some(rgss::CODE)){return Err("Vérification du ZIP RGSS échouée.".into())}Ok(())
    })();if result.is_err(){let _=std::fs::remove_file(output);}result
}
pub fn inspect_zip(path: &Path, source_name: &str) -> Result<Snapshot, String> {
    eprintln!("RPGM: checking ZIP entries");
    let mut zip = open_zip(path)?;
    eprintln!("RPGM: detecting ZIP game root");
    let names: HashSet<String> = zip.file_names().map(str::to_string).collect();
    let mut candidates = Vec::new();
    for name in &names {
        if name.split('/').any(|p| p == ".rpgm-toolkit-backups" || p == "RPGMToolkit") { continue; }
        if let Some(prefix) = name.strip_suffix("Game.ini") {
            if !names.contains(&format!("{prefix}js/plugins.js")) { candidates.push((prefix.to_string(), "RGSS")); }
        }
        if let Some(prefix) = name.strip_suffix("js/plugins.js") {
            if names.contains(&format!("{prefix}js/rmmz_core.js")) { candidates.push((prefix.to_string(), "MZ")); }
            else if names.contains(&format!("{prefix}js/rpg_core.js")) { candidates.push((prefix.to_string(), "MV")); }
        }
    }
    if candidates.is_empty() { return Err("Aucun jeu XP/VX/VX Ace/MV/MZ détecté dans le ZIP.".into()); }
    if candidates.len() != 1 { return Err("Ce ZIP contient plusieurs jeux. Fournissez un ZIP contenant un seul jeu.".into()); }
    let (prefix, engine) = candidates.remove(0);
    if names.contains(&format!("{prefix}.rpgm-toolkit-rgss-pending.json")) { return Err("Restauration RGSS requise en mode Dossier.".into()); }
    if engine == "RGSS" { return inspect_rgss_zip(&mut zip,&names,&prefix,source_name,path); }
    if names.contains(&format!("{prefix}.rpgm-toolkit-pending.json")) { return Err("Ce jeu contient une opération de dossier interrompue. Restaurez-la d’abord en mode Dossier.".into()); }
    let title = read_text(&mut zip, &format!("{prefix}data/System.json"))?.and_then(|s|serde_json::from_str::<Value>(s.trim_start_matches('\u{feff}')).ok()).and_then(|v|v["gameTitle"].as_str().map(str::to_string)).filter(|s|!s.is_empty()).unwrap_or_else(||source_name.into());
    eprintln!("RPGM: reading ZIP registry");
    let registry = read_text(&mut zip, &format!("{prefix}js/plugins.js"))?.ok_or("Liste de plugins absente.")?;
    let plugin = read_text(&mut zip, &format!("{prefix}{MOD_PATH}"))?;
    eprintln!("RPGM: validating ZIP registry");
    let info = Inspection {title, engine:engine.into(), prefix, source_name:source_name.into(), kind:"zip".into(), status:String::new(), plugin_count:0, files:zip.len(), size:path.metadata().map_err(|e|e.to_string())?.len(), fingerprint:String::new(), recovery_needed:false};
    let result = inspect_text(registry, plugin, info);
    eprintln!("RPGM: ZIP inspection finished");
    result
}
pub fn import_mod(path: &Path) -> Result<String, String> {
    if path.metadata().map_err(|e|e.to_string())?.len() > 16 * 1024 * 1024 { return Err("Le ZIP du mod dépasse 16 Mo.".into()); }
    let mut zip = open_zip(path)?;
    let names: Vec<String> = zip.file_names().filter(|name| name.rsplit('/').next() == Some("RPGMToolkit.js")).map(str::to_string).collect();
    if names.len() != 1 { return Err("Le ZIP doit contenir exactement un fichier RPGMToolkit.js.".into()); }
    let code = read_text(&mut zip, &names[0])?.ok_or("Plugin absent.")?;
    if !code.contains("@plugindesc") || !code.contains("RPGMToolkit") || code.len() < 100 { return Err("Le fichier ne ressemble pas à un plugin RPGMToolkit.".into()); }
    Ok(code)
}
pub fn transform_zip(input: &Path, output: &Path, snapshot: &Snapshot, code: &str, uninstall: bool, progress: impl Fn(usize,usize)) -> Result<(), String> {
    let current = inspect_zip(input, &snapshot.info.source_name)?;
    if current.info.fingerprint != snapshot.info.fingerprint { return Err("Le jeu a changé depuis son analyse. Sélectionnez-le à nouveau.".into()); }
    if crate::rgss::legacy(&snapshot.info.engine) { return transform_rgss_zip(input,output,snapshot,uninstall,progress); }
    let registry = patch_registry(&snapshot.registry, uninstall)?;
    let prefix = &snapshot.info.prefix; let registry_path = format!("{prefix}js/plugins.js"); let mod_path = format!("{prefix}{MOD_PATH}");
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
    let backup = format!("{prefix}.rpgm-toolkit-backups/{stamp}/");
    let mut archive = open_zip(input)?;
    let count = archive.len();
    let result = (|| {
        let target = File::create(output).map_err(|e|e.to_string())?;
        let mut writer = ZipWriter::new(target);
        for i in 0..count {
            let file = archive.by_index(i).map_err(|e|e.to_string())?;
            if file.name() != registry_path && file.name() != mod_path { writer.raw_copy_file(file).map_err(|e|e.to_string())?; }
            if i % 50 == 0 || i + 1 == count { progress(i+1,count); }
        }
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).unix_permissions(0o644);
        let mut write = |name:String, data:&str| -> Result<(),String> { writer.start_file(name,options).map_err(|e|e.to_string())?; writer.write_all(data.as_bytes()).map_err(|e|e.to_string()) };
        write(format!("{backup}plugins.js"),&snapshot.registry)?;
        if let Some(old) = &snapshot.previous_mod { write(format!("{backup}RPGMToolkit.js"),old)?; }
        write(format!("{backup}manifest.json"),&json!({"action":if uninstall {"uninstall"} else {"install"},"previousFingerprint":snapshot.info.fingerprint,"modSha256":hash(code.as_bytes()),"source":"RPGM Toolkit Android 1.0.1"}).to_string())?;
        write(registry_path,&registry)?;
        if !uninstall { write(mod_path,code)?; }
        let file = writer.finish().map_err(|e|e.to_string())?; file.sync_all().map_err(|e|e.to_string())?;
        let checked = inspect_zip(output,&snapshot.info.source_name)?;
        if checked.info.status != if uninstall { "absent" } else { "installed" } { return Err("La vérification du ZIP produit a échoué.".into()); }
        if !uninstall && checked.previous_mod.as_deref() != Some(code) { return Err("Le contenu du plugin produit est incorrect.".into()); }
        Ok(())
    })();
    if result.is_err() { let _ = std::fs::remove_file(output); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(name:&str)->(tempfile::TempDir,std::path::PathBuf) {
        let dir=tempfile::tempdir().unwrap();let path=dir.path().join("game.zip");let mut zip=ZipWriter::new(File::create(&path).unwrap());
        let files=[("Game/www/js/rpg_core.js","// MV"),("Game/www/js/plugins.js", "// generated\nvar $plugins = [{\"name\":\"Other\",\"status\":true,\"parameters\":{\"nested\":\"{\\\"a\\\":1}\"}}];"),("Game/www/data/System.json","{\"gameTitle\":\"Aster\"}"),(name,"original media data")];
        for (n,s) in files {zip.start_file(n,SimpleFileOptions::default()).unwrap();zip.write_all(s.as_bytes()).unwrap();}zip.finish().unwrap();(dir,path)
    }
    #[test] fn install_uninstall_roundtrip_preserves_other_files_and_backups(){
        let(dir,input)=fixture("Game/www/save/file1.rpgsave");let before=std::fs::read(&input).unwrap();let first=inspect_zip(&input,"game.zip").unwrap();assert_eq!(first.info.engine,"MV");assert_eq!(first.info.title,"Aster");
        let installed=dir.path().join("installed.zip");transform_zip(&input,&installed,&first,EMBEDDED_MOD,false,|_,_|{}).unwrap();assert_eq!(std::fs::read(&input).unwrap(),before);
        let next=inspect_zip(&installed,"installed.zip").unwrap();assert_eq!(next.info.status,"installed");let output=dir.path().join("clean.zip");transform_zip(&installed,&output,&next,EMBEDDED_MOD,true,|_,_|{}).unwrap();
        let clean=inspect_zip(&output,"clean.zip").unwrap();assert_eq!(clean.info.status,"absent");let mut zip=open_zip(&output).unwrap();assert_eq!(read_text(&mut zip,"Game/www/save/file1.rpgsave").unwrap().unwrap(),"original media data");assert!(zip.file_names().any(|n|n.contains(".rpgm-toolkit-backups/")));
        assert_eq!(parse_registry(&first.registry).unwrap().1,parse_registry(&clean.registry).unwrap().1);
    }
    #[test] fn unsafe_zip_path_rejected(){let(_dir,p)=fixture("../escape");assert!(inspect_zip(&p,"game.zip").is_err());}
    #[test] fn safe_names(){for n in ["../a","/absolute","C:/a","a\\b","a/../b","a//b"]{assert!(!valid_name(n));}assert!(valid_name("Jeu/日本語/file.ogg"));}
    #[test] fn parser_refuses_executable_registry(){assert!(patch_registry("var $plugins = evil();",false).is_err());assert!(patch_registry("var $plugins = [{\"name\":\"RPGMToolkit\"},{\"name\":\"RPGMToolkit\"}];",false).is_err());}
    #[test] fn installation_is_idempotent(){let a=patch_registry("var $plugins = [];",false).unwrap();let b=patch_registry(&a,false).unwrap();assert_eq!(a,b);assert_eq!(parse_registry(&a).unwrap().1.len(),1);}
    #[test] fn fingerprint_detects_plugin_changes(){assert_ne!(fingerprint("a",None),fingerprint("a",Some("")));assert_ne!(fingerprint("a",Some("1")),fingerprint("a",Some("2")));}
    #[test] fn javascript_literal_registry_preserves_user_parameters(){
        let input=r#"// Generated by RPG Maker.
var $plugins = [
 {name: "MPP_Patch", status: true, description: "【2019/11/30】不具合修正プラグイン", parameters: {"Patch19 enabled?": "true",},},
 {name: 'MadeWithMv', status: true, description: 'A "Made with MV" screen', parameters: {},},
 {name: 'MenuCommonEvent', status: true, parameters: {
 コモンイベント情報: '["{\\"SceneName\\":\\"Scene_Menu\\"}"]',
 command: 'this.standardPadding() * 4', color: '\\c[6]', comment: '/* not a comment */',
 },}, // comment
]; // end
"#;
        let before=parse_registry(input).unwrap().1;let installed=patch_registry(input,false).unwrap();let removed=patch_registry(&installed,true).unwrap();
        assert_eq!(parse_registry(&removed).unwrap().1,before);assert_eq!(parse_registry(&installed).unwrap().1.len(),4);
        assert_eq!(patch_registry(&installed,false).unwrap(),installed);
    }
    #[test] fn executable_and_deep_literals_are_rejected(){
        for s in ["var $plugins = [{name: call()}];","var $plugins = [{name: 'x', get status(){return true}}];","var $plugins = [...other];"]{assert!(patch_registry(s,false).is_err())}
        assert!(patch_registry(&format!("var $plugins = {}{};","[".repeat(1000),"]".repeat(1000)),false).is_err());
    }
    #[test] fn rgss_zip_roundtrip_for_all_three_engines(){
        for ext in ["rxdata","rvdata","rvdata2"]{
            let dir=tempfile::tempdir().unwrap();let input=dir.path().join("original.zip");let mut z=ZipWriter::new(File::create(&input).unwrap());let opts=SimpleFileOptions::default();
            let ini=format!("[Game]\r\nScripts=Data\\Scripts.{ext}\r\nTitle=Legacy\r\n");
            z.start_file("Game/Game.ini",opts).unwrap();z.write_all(ini.as_bytes()).unwrap();
            let scripts=crate::rgss::tests::fixture();z.start_file(format!("Game/Data/Scripts.{ext}"),opts).unwrap();z.write_all(&scripts).unwrap();
            z.start_file("Game/Save01.rvdata2",opts).unwrap();z.write_all(b"save data").unwrap();z.finish().unwrap();
            let original=std::fs::read(&input).unwrap();let before=inspect_zip(&input,"original.zip").unwrap();let installed=dir.path().join("installed.zip");
            transform_zip(&input,&installed,&before,EMBEDDED_MOD,false,|_,_|{}).unwrap();let snapshot=inspect_zip(&installed,"installed.zip").unwrap();assert_eq!(snapshot.info.status,"installed");
            let removed=dir.path().join("removed.zip");transform_zip(&installed,&removed,&snapshot,EMBEDDED_MOD,true,|_,_|{}).unwrap();let mut checked=open_zip(&removed).unwrap();assert_eq!(zip_bytes(&mut checked,"Game/Game.ini").unwrap(),ini.as_bytes());assert_eq!(zip_bytes(&mut checked,&format!("Game/Data/Scripts.{ext}")).unwrap(),scripts);assert_eq!(zip_bytes(&mut checked,"Game/Save01.rvdata2").unwrap(),b"save data");assert_eq!(std::fs::read(input).unwrap(),original);
        }
    }
}
