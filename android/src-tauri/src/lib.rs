mod engine;
mod rgss;
mod rgss_archive;
mod folders;
use engine::{Inspection, Snapshot};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use tauri::{AppHandle, Emitter, Manager};

struct Session {
    folders: Vec<folders::FolderGame>, folder_mode: bool, scan_warnings: Vec<String>,
    snapshot: Option<Snapshot>, source: Option<PathBuf>, folder_token: String,
    last_operation: String, last_error: Option<String>, code: String, mod_name: String, result: Option<PathBuf>, result_name: String, action: String,
}
impl Default for Session {
    fn default()->Self { Self {folders:Vec::new(),folder_mode:false,scan_warnings:Vec::new(),last_operation:String::new(),last_error:None,snapshot:None,source:None,folder_token:String::new(),code:engine::EMBEDDED_MOD.into(),mod_name:"Toolkit 1.8.1 · inclus".into(),result:None,result_name:String::new(),action:String::new()} }
}
#[derive(Default)] struct AppState { session: Mutex<Session>, busy: AtomicBool }
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> { fn drop(&mut self){self.0.store(false,Ordering::SeqCst);} }
#[cfg(target_os="android")]
struct Storage(tauri::plugin::PluginHandle<tauri::Wry>);
fn native(app:&AppHandle, command:&str, data:Value)->Result<Value,String> {
    #[cfg(target_os="android")]
    { app.state::<Storage>().0.run_mobile_plugin(command,data).map_err(|e|e.to_string()) }
    #[cfg(not(target_os="android"))]
    { let _=(app,command,data); Err("Le sélecteur natif est disponible dans l’application Android. Installez l’APK pour choisir votre jeu.".into()) }
}
fn view(s:&Session)->Value { json!({"folderMode":s.folder_mode,"games":s.folders.iter().map(|g|g.view(&s.code)).collect::<Vec<_>>(),"scanWarnings":s.scan_warnings,"lastOperation":s.last_operation,"lastError":s.last_error,"game":s.snapshot.as_ref().map(|s|&s.info),"modName":s.mod_name,"modSha256":engine::hash(s.code.as_bytes()),"modBytes":s.code.len(),"canExport":s.result.is_some(),"resultName":s.result_name,"action":s.action}) }
fn folder_snapshot(v:&Value)->Result<Snapshot,String> {
    let info=Inspection {title:v["title"].as_str().unwrap_or("Jeu RPG Maker").into(),engine:v["engine"].as_str().ok_or("Moteur absent.")?.into(),prefix:String::new(),source_name:v["name"].as_str().unwrap_or("Dossier").into(),kind:"folder".into(),status:String::new(),plugin_count:0,files:0,size:0,fingerprint:String::new(),recovery_needed:v["recoveryNeeded"].as_bool().unwrap_or(false)};
    let registry = v["registry"].as_str().ok_or("Liste de plugins absente.")?;
    if rgss::legacy(&info.engine) { return rgss::inspect(registry.into(),info); }
    engine::patch_registry(registry, false)?;
    engine::inspect_text(v["registry"].as_str().ok_or("Liste de plugins absente.")?.into(),v["plugin"].as_str().map(str::to_string),info)
}
fn progress(app:&AppHandle, stage:&str, percent:u32){let _=app.emit("operation-progress",json!({"stage":stage,"percent":percent}));}
async fn job(app:AppHandle, request_id:String, operation:impl FnOnce(&AppHandle,&mut Session)->Result<Value,String> + Send + 'static)->Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<AppState>();
        if state.busy.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err(){return Err("Une opération est déjà en cours.".into());}
        let _busy=Busy(&state.busy);
        let mut s=state.session.lock().map_err(|_|"Session indisponible.")?;
        let result=operation(&app,&mut s);
        s.last_operation=request_id;s.last_error=result.as_ref().err().cloned();
        result.map(|_|view(&s))
    }).await.map_err(|e|e.to_string())?
}
fn clear_result(s:&mut Session){if let Some(p)=s.result.take(){let _=std::fs::remove_file(p);}s.result_name.clear();}
#[tauri::command]
fn get_state(app:AppHandle)->Result<Value,String>{let state=app.state::<AppState>();let s=state.session.try_lock().map_err(|_|"Opération en cours.")?;Ok(view(&s))}
#[tauri::command]
async fn select_game(app:AppHandle,kind:String,request_id:String)->Result<Value,String>{job(app,request_id,move|app,s|{
    if kind!="zip"{return Err("Choisissez une archive ZIP.".into());}
    progress(app,"Sélection et lecture du jeu…",5);
    let data=native(app,"pick",json!({"kind":kind}))?;
    progress(app,"Détection du moteur et du mod…",55);
    let (snapshot,path)=if kind=="zip" {
        let path=PathBuf::from(data["path"].as_str().ok_or("Archive inaccessible.")?);
        let snapshot=match engine::inspect_zip(&path,data["name"].as_str().unwrap_or("game.zip")){Ok(s)=>s,Err(e)=>{let _=std::fs::remove_file(path);return Err(e);}};
        (snapshot,Some(path))
    }else{(folder_snapshot(&data)?,None)};
    if let Some(old)=s.source.take(){let _=std::fs::remove_file(old);}clear_result(s);
    s.folder_mode=false;s.snapshot=Some(snapshot);s.source=path;s.folder_token=data["token"].as_str().unwrap_or("").into();s.action.clear();
    progress(app,"Jeu détecté",100);Ok(view(s))
}).await}
#[tauri::command]
async fn scan_folders(app:AppHandle,request_id:String)->Result<Value,String>{job(app,request_id,|app,s|{
    progress(app,"Recherche des jeux dans les sous-dossiers…",5);
    let data=native(app,"pick",json!({"kind":"folder"}))?;
    let games=data["games"].as_array().ok_or("Résultat d’analyse invalide.")?;
    s.scan_warnings=data["warnings"].as_array().map(|v|v.iter().filter_map(|e|e.as_str().map(str::to_owned)).collect()).unwrap_or_default();
    for (index,data) in games.iter().enumerate() {
        progress(app,&format!("Analyse · {} / {}",index+1,games.len()),10+(index*85/games.len().max(1))as u32);
        let mut inspected=if data["error"].is_string(){data.clone()}else{
            match native(app,"inspectFolder",json!({"token":data["token"]})){
                Ok(value)=>value,
                Err(error)=>json!({"title":data["title"],"error":error})
            }
        };
        inspected["token"]=data["token"].clone();inspected["path"]=data["path"].clone();
        let game=folders::FolderGame::from_scan(&inspected)?;
        if let Some(index)=s.folders.iter().position(|g|g.token==game.token){s.folders[index]=game;}
        else if s.folders.len()<500{s.folders.push(game);}
        else{s.scan_warnings.push("500 jeux maximum. Retirez des entrées avant de poursuivre.".into());break;}
    }
    if games.is_empty(){s.scan_warnings.push("Aucun jeu RPG Maker détecté dans ce dossier.".into());}
    s.folder_mode=true;clear_result(s);
    progress(app,"Analyse terminée",100);Ok(view(s))
}).await}
#[tauri::command]
async fn refresh_folders(app:AppHandle,request_id:String)->Result<Value,String>{job(app,request_id,|app,s|{
    let total=s.folders.len();
    for (i,game) in s.folders.iter_mut().enumerate(){
        progress(app,&format!("Analyse · {}",game.title),(i*100/total.max(1))as u32);
        match native(app,"inspectFolder",json!({"token":game.token})).and_then(|v|folder_snapshot(&v)){
            Ok(snapshot)=>{game.title=snapshot.info.title.clone();game.set_snapshot(snapshot);game.error=None;},
            Err(error)=>{game.error=Some(error);}
        }
        game.result.clear();
    }
    s.scan_warnings.clear();progress(app,"Analyse terminée",100);Ok(view(s))
}).await}
#[tauri::command]
async fn remove_folder(app:AppHandle,token:String,request_id:String)->Result<Value,String>{job(app,request_id,move|app,s|{
    native(app,"forgetFolder",json!({"token":token}))?;
    s.folders.retain(|g|g.token!=token);Ok(view(s))
}).await}
#[tauri::command]
async fn apply_folders(app:AppHandle,tokens:Vec<String>,uninstall:bool,request_id:String)->Result<Value,String>{job(app,request_id,move|app,s|{
    let selected:std::collections::HashSet<_>=tokens.iter().collect();
    if selected.is_empty()||selected.len()!=tokens.len()||tokens.iter().any(|t|!s.folders.iter().any(|g|&g.token==t)){return Err("Sélection de jeux invalide.".into());}
    let total=tokens.len();
    for (i,token) in tokens.iter().enumerate(){
        let game=s.folders.iter_mut().find(|g|&g.token==token).unwrap();
        progress(app,&format!("{} / {} · {}",i+1,total,game.title),(i*100/total)as u32);
        game.apply(&s.code,uninstall,|command,data|native(app,command,data));
    }
    progress(app,"Traitement terminé",100);Ok(view(s))
}).await}
#[tauri::command]
async fn recover_folder(app:AppHandle,token:String,request_id:String)->Result<Value,String>{job(app,request_id,move|app,s|{
    let game=s.folders.iter_mut().find(|g|g.token==token).ok_or("Jeu absent de la sélection.")?;
    let data=native(app,"recoverFolder",json!({"token":token}))?;
    game.set_snapshot(folder_snapshot(&data)?);game.error=None;game.result="restored".into();Ok(view(s))
}).await}
#[tauri::command]
async fn select_mod(app:AppHandle,request_id:String)->Result<Value,String>{job(app,request_id,|app,s|{
    let data=native(app,"pick",json!({"kind":"mod"}))?;let path=PathBuf::from(data["path"].as_str().ok_or("Archive inaccessible.")?);
    let code=engine::import_mod(&path);let _=std::fs::remove_file(path);s.code=code?;s.mod_name=data["name"].as_str().unwrap_or("ZIP du mod").into();clear_result(s);Ok(view(s))
}).await}
#[tauri::command]
async fn reset_mod(app:AppHandle,request_id:String)->Result<Value,String>{job(app,request_id,|_,s|{s.code=engine::EMBEDDED_MOD.into();s.mod_name="Toolkit 1.8.1 · inclus".into();clear_result(s);Ok(view(s))}).await}
#[tauri::command]
async fn apply_mod(app:AppHandle,uninstall:bool,request_id:String)->Result<Value,String>{job(app,request_id,move|app,s|{
    let snapshot=s.snapshot.clone().ok_or("Sélectionnez un jeu.")?;
    if snapshot.info.recovery_needed {return Err("Restaurez d’abord l’opération interrompue.".into());}
    if uninstall&&snapshot.info.status=="absent"{return Err("Le mod n’est pas installé dans ce jeu.".into());}
    let patched=engine::patch_snapshot(&snapshot,uninstall)?;
    progress(app,"Copie de secours et préparation…",10);
    clear_result(s);
    if let Some(input)=&s.source {
        let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
        let result=input.parent().ok_or("Dossier temporaire absent.")?.join(format!("result-{stamp}.zip"));
        engine::transform_zip(input,&result,&snapshot,&s.code,uninstall,|done,total|progress(app,"Création du nouveau ZIP…",10+(75*done/total.max(1))as u32))?;
        s.result=Some(result);
        let stem=snapshot.info.source_name.trim_end_matches(".zip").trim_end_matches("-toolkit").trim_end_matches("-sans-toolkit");
        let safe:String=stem.chars().map(|c|if "/\\:*?\"<>|".contains(c){'_'}else{c}).take(100).collect();
        s.result_name=format!("{}-{}.zip",safe,if uninstall {"sans-toolkit"}else{"toolkit"});
    }else{
        let data=native(app,"applyFolder",json!({"token":s.folder_token,"registry":patched,"plugin":if uninstall {None}else{Some(&s.code)},"expected":snapshot.info.fingerprint,"uninstall":uninstall}))?;
        s.snapshot=Some(folder_snapshot(&data)?);
    }
    s.action=if uninstall {"uninstall"}else{"install"}.into();progress(app,"Vérification terminée",100);Ok(view(s))
}).await}
#[tauri::command]
async fn export_result(app:AppHandle,request_id:String)->Result<Value,String>{job(app,request_id,|app,s|{
    let result=s.result.clone().ok_or("Aucun ZIP à exporter.")?;
    progress(app,"Choisissez où enregistrer le nouveau ZIP…",5);
    native(app,"exportZip",json!({"path":result.to_string_lossy(),"name":s.result_name}))?;
    let snapshot=engine::inspect_zip(&result,&s.result_name)?;
    if let Some(old)=s.source.take(){if old!=result{let _=std::fs::remove_file(old);}}
    s.source=s.result.take();s.snapshot=Some(snapshot);s.result_name.clear();progress(app,"ZIP exporté et vérifié",100);Ok(view(s))
}).await}
#[tauri::command]
async fn recover_game(app:AppHandle,request_id:String)->Result<Value,String>{job(app,request_id,|app,s|{
    let data=native(app,"recoverFolder",json!({"token":s.folder_token}))?;s.snapshot=Some(folder_snapshot(&data)?);Ok(view(s))
}).await}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder=tauri::Builder::default().manage(AppState::default());
    #[cfg(target_os="android")]
    let builder=builder.plugin(tauri::plugin::Builder::<tauri::Wry>::new("storage").setup(|app,api|{app.manage(Storage(api.register_android_plugin("fr.azk.rpgmtoolkit","StoragePlugin")?));Ok(())}).build());
    builder.invoke_handler(tauri::generate_handler![get_state,select_game,select_mod,reset_mod,apply_mod,export_result,recover_game,scan_folders,refresh_folders,remove_folder,apply_folders,recover_folder])
        .run(tauri::generate_context!()).expect("Unable to start RPGM Toolkit");
}
