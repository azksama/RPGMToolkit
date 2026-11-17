use base64::{engine::general_purpose::STANDARD as B64, Engine};
use flate2::{read::ZlibDecoder, write::ZlibEncoder, Compression};
use serde_json::{json, Value};
use std::io::{Read, Write};

pub const CODE: &str = include_str!("../resources/RPGMToolkit.rb");
pub const LIMIT: usize = 16 * 1024 * 1024;
const NAME: &[u8] = b"RPGMToolkit";

#[derive(Clone, Debug, PartialEq)]
enum M {
    Nil,
    Bool(bool),
    Int(i32),
    BigInt(u8, Vec<u8>),
    Bytes(Vec<u8>),
    Symbol(Vec<u8>),
    Array(Vec<M>),
    Ivar(Box<M>, Vec<(M, M)>),
}
fn weight(v: &M) -> usize {
    64 + match v {
        M::Bytes(b) | M::Symbol(b) | M::BigInt(_, b) => b.len(),
        M::Array(a) => a.iter().map(weight).sum(),
        M::Ivar(v, a) => weight(v) + a.iter().map(|(k, v)| weight(k) + weight(v)).sum::<usize>(),
        _ => 0,
    }
}
struct Decoder<'a> {
    data: &'a [u8],
    pos: usize,
    objects: Vec<Option<M>>,
    symbols: Vec<Vec<u8>>,
    count: usize,
    memory: usize,
}
impl Decoder<'_> {
    fn charge(&mut self, n: usize) -> Result<(), String> {
        self.memory = self.memory.saturating_add(n);
        if self.memory > LIMIT * 8 {
            return Err("Références Marshal trop volumineuses.".into());
        }
        Ok(())
    }
    fn byte(&mut self) -> Result<u8, String> {
        let b = *self.data.get(self.pos).ok_or("Scripts tronqués.")?;
        self.pos += 1;
        Ok(b)
    }
    fn integer(&mut self) -> Result<i32, String> {
        let c = self.byte()? as i8;
        if c == 0 {
            return Ok(0);
        }
        if c > 4 {
            return Ok(c as i32 - 5);
        }
        if c < -4 {
            return Ok(c as i32 + 5);
        }
        let mut n = if c < 0 { u32::MAX } else { 0 };
        for i in 0..c.unsigned_abs() {
            n = (n & !(255u32 << (i * 8))) | ((self.byte()? as u32) << (i * 8));
        }
        Ok(n as i32)
    }
    fn size(&mut self, max: usize) -> Result<usize, String> {
        let n = self.integer()?;
        if n < 0 || n as usize > max {
            return Err("Taille Marshal invalide.".into());
        }
        Ok(n as usize)
    }
    fn value(&mut self, depth: usize) -> Result<M, String> {
        self.count += 1;
        if depth > 32 || self.count > 200_000 {
            return Err("Scripts Marshal trop complexes.".into());
        }
        match self.byte()? {
            b'0' => Ok(M::Nil),
            b'T' => Ok(M::Bool(true)),
            b'F' => Ok(M::Bool(false)),
            b'i' => Ok(M::Int(self.integer()?)),
            b'l' => {
                let sign = self.byte()?;
                if sign != b'+' && sign != b'-' {
                    return Err("Signe entier Marshal invalide.".into());
                }
                let length = self.size(512)? * 2;
                let end = self.pos.checked_add(length).ok_or("Taille entière invalide.")?;
                let bytes = self.data.get(self.pos..end).ok_or("Entier Marshal tronqué.")?.to_vec();
                self.pos = end;
                self.charge(length * 2 + 128)?;
                let value = M::BigInt(sign, bytes);
                self.objects.push(Some(value.clone()));
                Ok(value)
            }
            b'@' => {
                let i = self.size(self.objects.len())?;
                let n = self
                    .objects
                    .get(i)
                    .and_then(|v| v.as_ref())
                    .map(weight)
                    .ok_or("Référence Marshal cyclique ou invalide.")?;
                self.charge(n)?;
                self.objects
                    .get(i)
                    .and_then(Clone::clone)
                    .ok_or("Référence Marshal cyclique ou invalide.".into())
            }
            b';' => {
                let i = self.size(self.symbols.len())?;
                self.symbols
                    .get(i)
                    .cloned()
                    .map(M::Symbol)
                    .ok_or("Symbole Marshal invalide.".into())
            }
            b'"' | b':' => {
                let tag = self.data[self.pos - 1];
                let n = self.size(LIMIT)?;
                self.charge(n * 2 + 128)?;
                let end = self.pos.checked_add(n).ok_or("Taille invalide.")?;
                let b = self
                    .data
                    .get(self.pos..end)
                    .ok_or("Chaîne Marshal tronquée.")?
                    .to_vec();
                self.pos = end;
                if tag == b':' {
                    self.symbols.push(b.clone());
                    Ok(M::Symbol(b))
                } else {
                    let v = M::Bytes(b);
                    self.objects.push(Some(v.clone()));
                    Ok(v)
                }
            }
            b'[' => {
                let n = self.size(50_000)?;
                self.charge(n * 64)?;
                let slot = self.objects.len();
                self.objects.push(None);
                let mut a = Vec::with_capacity(n);
                for _ in 0..n {
                    a.push(self.value(depth + 1)?)
                }
                let v = M::Array(a);
                self.charge(weight(&v))?;
                self.objects[slot] = Some(v.clone());
                Ok(v)
            }
            b'I' => {
                let slot = self.objects.len();
                let v = self.value(depth + 1)?;
                let n = self.size(16)?;
                let mut attrs = Vec::new();
                for _ in 0..n {
                    attrs.push((self.value(depth + 1)?, self.value(depth + 1)?));
                }
                let wrapped = M::Ivar(Box::new(v), attrs);
                self.charge(weight(&wrapped))?;
                if slot < self.objects.len() {
                    self.objects[slot] = Some(wrapped.clone())
                }
                Ok(wrapped)
            }
            _ => Err("Type Marshal inattendu dans les scripts. Aucun code exécuté.".into()),
        }
    }
}
fn integer(n: i32, out: &mut Vec<u8>) {
    if n == 0 {
        out.push(0)
    } else if (1..123).contains(&n) {
        out.push((n + 5) as u8)
    } else if (-123..0).contains(&n) {
        out.push((n - 5) as u8)
    } else {
        let bytes = n.to_le_bytes();
        let mut len = 4;
        while len > 1 && bytes[len - 1] == if n < 0 { 255 } else { 0 } {
            len -= 1
        }
        out.push(if n < 0 {
            (-(len as i8)) as u8
        } else {
            len as u8
        });
        out.extend_from_slice(&bytes[..len]);
    }
}
fn encode(v: &M, out: &mut Vec<u8>) {
    match v {
        M::Nil => out.push(b'0'),
        M::Bool(b) => out.push(if *b { b'T' } else { b'F' }),
        M::Int(n) => {
            out.push(b'i');
            integer(*n, out)
        }
        M::BigInt(sign, bytes) => {
            out.extend([b'l', *sign]);
            integer((bytes.len() / 2) as i32, out);
            out.extend(bytes);
        }
        M::Bytes(b) | M::Symbol(b) => {
            out.push(if matches!(v, M::Bytes(_)) { b'"' } else { b':' });
            integer(b.len() as i32, out);
            out.extend(b)
        }
        M::Array(a) => {
            out.push(b'[');
            integer(a.len() as i32, out);
            for v in a {
                encode(v, out)
            }
        }
        M::Ivar(v, a) => {
            out.push(b'I');
            encode(v, out);
            integer(a.len() as i32, out);
            for (k, v) in a {
                encode(k, out);
                encode(v, out)
            }
        }
    }
}
fn raw(v: &M) -> Option<&[u8]> {
    match v {
        M::Bytes(b) => Some(b),
        M::Ivar(v, _) => raw(v),
        _ => None,
    }
}
fn entries(data: &[u8]) -> Result<Vec<M>, String> {
    if data.len() > LIMIT || !data.starts_with(&[4, 8]) {
        return Err("Scripts RGSS invalides (Marshal 4.8 requis).".into());
    }
    let mut d = Decoder {
        data,
        pos: 2,
        objects: Vec::new(),
        symbols: Vec::new(),
        count: 0,
        memory: 0,
    };
    let value = d.value(0)?;
    if d.pos != data.len() {
        return Err("Données supplémentaires après les scripts.".into());
    }
    let M::Array(a) = value else {
        return Err("Tableau de scripts absent.".into());
    };
    for v in &a {
        match v {
            M::Array(row)
                if row.len() == 3
                    && matches!(row[0], M::Int(_) | M::BigInt(_, _))
                    && raw(&row[1]).is_some()
                    && raw(&row[2]).is_some() => {}
            _ => return Err("Entrée de script invalide.".into()),
        }
    }
    Ok(a)
}
fn is_tool(v: &M) -> bool {
    matches!(v,M::Array(a) if raw(&a[1])==Some(NAME))
}
pub fn unpack_code(data: &[u8]) -> Result<String, String> {
    let mut bytes = Vec::new();
    ZlibDecoder::new(data)
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > LIMIT {
        return Err("Script décompressé trop volumineux.".into());
    }
    String::from_utf8(bytes).map_err(|_| "Script Toolkit non UTF-8.".into())
}
pub fn inspect_scripts(data: &[u8]) -> Result<(usize, Option<String>), String> {
    let a = entries(data)?;
    let own: Vec<_> = a.iter().filter(|v| is_tool(v)).collect();
    if own.len() > 1 {
        return Err("Plusieurs scripts RPGMToolkit existent.".into());
    }
    let code = own
        .first()
        .map(|v| {
            let M::Array(row) = v else { unreachable!() };
            unpack_code(raw(&row[2]).unwrap())
        })
        .transpose()?;
    Ok((a.len(), code))
}
pub fn patch_scripts(data: &[u8], uninstall: bool) -> Result<Vec<u8>, String> {
    inspect_scripts(data)?;
    let mut a = entries(data)?;
    a.retain(|v| !is_tool(v));
    if !uninstall {
        let mut z = ZlibEncoder::new(Vec::new(), Compression::default());
        z.write_all(CODE.as_bytes()).map_err(|e| e.to_string())?;
        a.insert(
            0,
            M::Array(vec![
                M::Int(1600001),
                M::Bytes(NAME.to_vec()),
                M::Bytes(z.finish().map_err(|e| e.to_string())?),
            ]),
        );
    }
    let mut out = vec![4, 8];
    encode(&M::Array(a), &mut out);
    if out.len() > LIMIT {
        return Err("Scripts modifiés trop volumineux.".into());
    }
    Ok(out)
}
pub fn decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() > LIMIT * 2 {
        return Err("Données RGSS trop volumineuses.".into());
    }
    B64.decode(s).map_err(|_| "Données RGSS invalides.".into())
}
pub fn b64(bytes: &[u8]) -> String {
    B64.encode(bytes)
}
pub fn bundle(ini: &[u8], original: &[u8], scripts: &[u8]) -> String {
    json!({"ini":b64(ini),"originalIni":b64(original),"scripts":b64(scripts)}).to_string()
}
pub fn fields(registry: &str) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), String> {
    let v: Value = serde_json::from_str(registry).map_err(|_| "État RGSS invalide.")?;
    let get = |k: &str| decode(v[k].as_str().ok_or("Champ RGSS absent.")?);
    Ok((get("ini")?, get("originalIni")?, get("scripts")?))
}
pub fn script_path(ini: &[u8]) -> Result<(String, String), String> {
    let mut section = false;
    let mut found = None;
    for line in ini.split(|b| *b == b'\n') {
        let s = String::from_utf8_lossy(line);
        let s = s.trim().trim_start_matches('\u{feff}');
        if s.starts_with('[') {
            section = s.eq_ignore_ascii_case("[Game]");
            continue;
        }
        if section {
            if let Some((key, value)) = s.split_once('=') {
                if key.trim().eq_ignore_ascii_case("Scripts") {
                    if found.is_some() {
                        return Err("Plusieurs chemins Scripts dans Game.ini.".into());
                    }
                    let path = value.trim().replace('\\', "/");
                    if !path.is_ascii()
                        || path.starts_with('/')
                        || path.contains(':')
                        || path
                            .split('/')
                            .any(|p| p.is_empty() || p == ".." || p == ".")
                    {
                        return Err("Chemin des scripts non pris en charge.".into());
                    }
                    let lower = path.to_lowercase();
                    let engine = if lower.ends_with(".rvdata2") {
                        "VX Ace"
                    } else if lower.ends_with(".rvdata") {
                        "VX"
                    } else if lower.ends_with(".rxdata") {
                        "XP"
                    } else {
                        return Err("Extension de scripts RGSS inconnue.".into());
                    };
                    found = Some((path, engine.into()));
                }
            }
        }
    }
    found.ok_or("Chemin Scripts absent de Game.ini.".into())
}
pub fn target(ini: &[u8]) -> Result<String, String> {
    let (p, _) = script_path(ini)?;
    Ok(format!(
        "RPGMToolkit/Scripts.{}",
        p.rsplit('.').next().unwrap()
    ))
}
pub fn redirect(ini: &[u8]) -> Result<Vec<u8>, String> {
    let path = target(ini)?;
    let mut out = Vec::new();
    let mut section = false;
    for line in ini.split_inclusive(|b| *b == b'\n') {
        let text = String::from_utf8_lossy(line);
        let trimmed = text.trim().trim_start_matches('\u{feff}');
        if trimmed.starts_with('[') {
            section = trimmed.eq_ignore_ascii_case("[Game]")
        }
        if section
            && trimmed
                .split_once('=')
                .is_some_and(|(k, _)| k.trim().eq_ignore_ascii_case("Scripts"))
        {
            let eq = line.iter().position(|b| *b == b'=').unwrap();
            out.extend_from_slice(&line[..=eq]);
            out.extend(path.replace('/', "\\").as_bytes());
            if line.ends_with(b"\r\n") {
                out.extend(b"\r\n")
            } else if line.ends_with(b"\n") {
                out.push(b'\n')
            }
        } else {
            out.extend_from_slice(line)
        }
    }
    Ok(out)
}
pub fn inspect(
    registry: String,
    mut info: crate::engine::Inspection,
) -> Result<crate::engine::Snapshot, String> {
    let (ini, original, scripts) = fields(&registry)?;
    let (_, engine) = script_path(&original)?;
    let (count, code) = inspect_scripts(&scripts)?;
    info.engine = engine;
    info.plugin_count = count;
    info.status = if code.is_some() && ini == redirect(&original)? {
        "installed"
    } else if code.is_some() {
        "incomplete"
    } else {
        "absent"
    }
    .into();
    info.fingerprint = crate::engine::fingerprint(&registry, None);
    Ok(crate::engine::Snapshot {
        info,
        registry,
        previous_mod: code,
    })
}
pub fn patch(registry: &str, uninstall: bool) -> Result<String, String> {
    let (_, original, scripts) = fields(registry)?;
    let ini = if uninstall {
        original.clone()
    } else {
        redirect(&original)?
    };
    let scripts = patch_scripts(&scripts, uninstall)?;
    Ok(bundle(&ini, &original, &scripts))
}
pub fn legacy(engine: &str) -> bool {
    matches!(engine, "XP" | "VX" | "VX Ace")
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    pub fn fixture() -> Vec<u8> {
        let mut out = vec![4, 8];
        let mut z = ZlibEncoder::new(Vec::new(), Compression::default());
        z.write_all(b"$original = true").unwrap();
        encode(
            &M::Array(vec![M::Array(vec![
                M::Int(42),
                M::Bytes(b"Main".to_vec()),
                M::Bytes(z.finish().unwrap()),
            ])]),
            &mut out,
        );
        out
    }
    #[test]
    fn scripts_roundtrip() {
        let original = fixture();
        let installed = patch_scripts(&original, false).unwrap();
        assert_eq!(inspect_scripts(&installed).unwrap(), (2, Some(CODE.into())));
        assert_eq!(patch_scripts(&installed, false).unwrap(), installed);
        assert_eq!(patch_scripts(&installed, true).unwrap(), original);
    }
    #[test]
    fn ini_roundtrip() {
        for (ext, engine) in [("rxdata", "XP"), ("rvdata", "VX"), ("rvdata2", "VX Ace")] {
            let ini = format!(
                "[Game]\r\nLibrary=RGSS.dll\r\nScripts=Data\\Scripts.{ext}\r\nTitle=Test\r\n"
            );
            assert_eq!(script_path(ini.as_bytes()).unwrap().1, engine);
            let state = bundle(ini.as_bytes(), ini.as_bytes(), &fixture());
            let installed = patch(&state, false).unwrap();
            let (current, original, _) = fields(&installed).unwrap();
            assert_eq!(original, ini.as_bytes());
            assert!(String::from_utf8(current)
                .unwrap()
                .contains("Scripts=RPGMToolkit\\Scripts."));
            assert_eq!(
                fields(&patch(&installed, true).unwrap()).unwrap().0,
                ini.as_bytes()
            );
        }
    }
    #[test]
    fn preserves_large_script_ids_and_object_links() {
        // Marshal.dump([[2**31, "Main", ""], [2**31, "Main", ""]]) on 32-bit Ruby.
        let data = [4, 8, b'[', 7, b'[', 8, b'l', b'+', 7, 0, 0, 0, 128,
            b'"', 9, b'M', b'a', b'i', b'n', b'"', 0,
            b'[', 8, b'@', 7, b'@', 8, b'@', 9];
        let before = entries(&data).unwrap();
        assert_eq!(before[0], before[1]);
        let installed = patch_scripts(&data, false).unwrap();
        assert_eq!(inspect_scripts(&installed).unwrap(), (3, Some(CODE.into())));
        assert_eq!(entries(&patch_scripts(&installed, true).unwrap()).unwrap(), before);
    }
    #[test]
    fn rejects_truncated_and_invalid_bignums() {
        for bytes in [vec![4, 8, b'l', b'?', 0], vec![4, 8, b'l', b'+', 7, 0]] {
            assert!(inspect_scripts(&bytes).is_err());
        }
    }
    #[test]
    fn rejects_bad_data() {
        for b in [vec![], vec![4, 8, b'o'], vec![4, 8, b'[', 6, b'@', 0]] {
            assert!(inspect_scripts(&b).is_err())
        }
        assert!(script_path(b"[Game]\nScripts=../Scripts.rvdata2").is_err());
    }
}
