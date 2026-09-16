use crate::rgss::LIMIT;
use std::io::Read;

fn bytes(r: &mut impl Read, n: usize) -> Result<Vec<u8>, String> {
    if n > LIMIT {
        return Err("Entrée RGSS trop volumineuse.".into());
    }
    let mut b = vec![0; n];
    r.read_exact(&mut b).map_err(|_| "Archive RGSS tronquée.")?;
    Ok(b)
}
fn word(r: &mut impl Read) -> Result<u32, String> {
    let b = bytes(r, 4)?;
    Ok(u32::from_le_bytes(b.try_into().unwrap()))
}
fn skip(r: &mut impl Read, n: u64) -> Result<(), String> {
    let read = std::io::copy(&mut r.take(n), &mut std::io::sink()).map_err(|e| e.to_string())?;
    if read != n {
        return Err("Archive RGSS tronquée.".into());
    }
    Ok(())
}
fn next(k: &mut u32) -> u32 {
    let old = *k;
    *k = k.wrapping_mul(7).wrapping_add(3);
    old
}
fn decrypt(mut b: Vec<u8>, mut k: u32) -> Vec<u8> {
    for chunk in b.chunks_mut(4) {
        let key = next(&mut k).to_le_bytes();
        for (i, v) in chunk.iter_mut().enumerate() {
            *v ^= key[i];
        }
    }
    b
}
fn matches(name: &[u8], wanted: &str) -> bool {
    String::from_utf8_lossy(name)
        .replace('\\', "/")
        .eq_ignore_ascii_case(wanted)
}
pub fn extract(r: &mut impl Read, wanted: &str) -> Result<Vec<u8>, String> {
    let header = bytes(r, 8)?;
    if &header[..7] != b"RGSSAD\0" {
        return Err("Archive RGSS non reconnue.".into());
    }
    match header[7] {
        1 => {
            let mut key = 0xdeadcafe;
            for _ in 0..100_000 {
                let size = word(r)? ^ next(&mut key);
                if size > 4096 {
                    return Err("Nom RGSS trop long.".into());
                }
                let mut name = bytes(r, size as usize)?;
                for b in &mut name {
                    *b ^= next(&mut key) as u8
                }
                let len = word(r)? ^ next(&mut key);
                if matches(&name, wanted) {
                    return Ok(decrypt(bytes(r, len as usize)?, key));
                }
                skip(r, len as u64)?;
            }
            Err("Trop d’entrées RGSS.".into())
        }
        3 => {
            let key = word(r)?.wrapping_mul(9).wrapping_add(3);
            let mut pos = 12u64;
            let mut found = None;
            for _ in 0..100_000 {
                let offset = word(r)? ^ key;
                pos += 4;
                if offset == 0 {
                    break;
                }
                let len = word(r)? ^ key;
                let filekey = word(r)? ^ key;
                let size = word(r)? ^ key;
                pos += 12;
                if size > 4096 {
                    return Err("Nom RGSS trop long.".into());
                }
                let mut name = bytes(r, size as usize)?;
                pos += size as u64;
                let k = key.to_le_bytes();
                for (i, b) in name.iter_mut().enumerate() {
                    *b ^= k[i % 4]
                }
                if matches(&name, wanted) {
                    if found.is_some() {
                        return Err("Scripts en double dans l’archive.".into());
                    }
                    found = Some((offset as u64, len as usize, filekey));
                }
            }
            let (offset, len, filekey) = found.ok_or("Scripts absents de l’archive RGSS.")?;
            if offset < pos {
                return Err("Position RGSS invalide.".into());
            }
            skip(r, offset - pos)?;
            Ok(decrypt(bytes(r, len)?, filekey))
        }
        _ => Err("Version d’archive RGSS inconnue.".into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_v1_v3_and_rejects_truncation() {
        let wanted = "Data/Scripts.rvdata2";
        let data = b"test script bytes";
        let mut a = b"RGSSAD\0\x01".to_vec();
        let mut k = 0xdeadcafe;
        a.extend(((wanted.len() as u32) ^ next(&mut k)).to_le_bytes());
        for b in wanted.bytes() {
            a.push(b ^ next(&mut k) as u8)
        }
        a.extend(((data.len() as u32) ^ next(&mut k)).to_le_bytes());
        a.extend(decrypt(data.to_vec(), k));
        assert_eq!(extract(&mut &a[..], wanted).unwrap(), data);
        let seed = 123u32;
        let k = seed * 9 + 3;
        let offset = 12 + 16 + wanted.len() + 4;
        let mut b = b"RGSSAD\0\x03".to_vec();
        b.extend(seed.to_le_bytes());
        for n in [offset as u32, data.len() as u32, 42, wanted.len() as u32] {
            b.extend((n ^ k).to_le_bytes())
        }
        for (i, c) in wanted.bytes().enumerate() {
            b.push(c ^ k.to_le_bytes()[i % 4])
        }
        b.extend(k.to_le_bytes());
        b.extend(decrypt(data.to_vec(), 42));
        assert_eq!(extract(&mut &b[..], wanted).unwrap(), data);
        b.pop();
        assert!(extract(&mut &b[..], wanted).is_err());
    }
}
