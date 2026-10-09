use crate::{codec::Reader, Result, LIMIT};

pub fn background(bytes: &[u8]) -> Result<Vec<u8>> {
    if bytes.len() > LIMIT
        || bytes.len() < 40
        || bytes[..9] != [0, b'W', 0, 0, b'O', b'L', 0, b'F', b'M']
        || ![0, 0x55].contains(&bytes[9])
    {
        return Err("WOLF: Game.dat protégé ou inconnu.".into());
    }
    let mut reader = Reader {
        bytes,
        pos: 10,
        utf8: bytes[9] == 0x55,
    };
    let count = reader.count(256)?;
    if count < 21 {
        return Err("WOLF: paramètres Game.dat incomplets.".into());
    }
    let settings = reader.take(count)?;
    if settings[19] > 2 {
        return Err("WOLF: mode d’arrière-plan inconnu.".into());
    }
    for _ in 0..reader.count(100)? {
        reader.string()?;
    }
    if reader.int()? as usize != bytes.len() - 1 {
        return Err("WOLF: taille Game.dat incohérente.".into());
    }
    reader.int()?;
    let count = reader.count(256)?;
    if count < 19 {
        return Err("WOLF: paramètres Game.dat incomplets.".into());
    }
    reader.take(count * 2)?;
    if bytes.len() - reader.pos < 9 {
        return Err("WOLF: Game.dat tronqué.".into());
    }
    let mut next = bytes.to_vec();
    next[33] = 1;
    Ok(next)
}
