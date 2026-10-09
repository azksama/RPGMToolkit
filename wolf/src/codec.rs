use crate::{Result, LIMIT};
use encoding_rs::SHIFT_JIS;
use std::ops::Range;

pub struct Reader<'a> {
    pub bytes: &'a [u8],
    pub pos: usize,
    pub utf8: bool,
}
impl<'a> Reader<'a> {
    pub fn take(&mut self, size: usize) -> Result<&'a [u8]> {
        let end = self.pos.checked_add(size).ok_or("WOLF: taille invalide.")?;
        let data = self
            .bytes
            .get(self.pos..end)
            .ok_or("WOLF: fichier tronqué.")?;
        self.pos = end;
        Ok(data)
    }
    pub fn byte(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }
    pub fn int(&mut self) -> Result<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    pub fn count(&mut self, max: usize) -> Result<usize> {
        let n = self.int()? as usize;
        if n > max {
            return Err("WOLF: limite de structure dépassée.".into());
        }
        Ok(n)
    }
    pub fn expect(&mut self, byte: u8) -> Result<()> {
        if self.byte()? != byte {
            return Err("WOLF: structure non reconnue.".into());
        }
        Ok(())
    }
    pub fn string(&mut self) -> Result<String> {
        let n = self.count(4 * 1024 * 1024)?;
        let bytes = self.take(n)?;
        let raw = bytes
            .strip_suffix(&[0])
            .ok_or("WOLF: chaîne sans terminaison.")?;
        if raw.contains(&0) {
            return Err("WOLF: chaîne contenant un caractère nul.".into());
        }
        if self.utf8 {
            String::from_utf8(raw.to_vec()).map_err(|_| "WOLF: chaîne UTF-8 invalide.".into())
        } else {
            let (text, _, invalid) = SHIFT_JIS.decode(raw);
            if invalid {
                return Err("WOLF: chaîne Shift-JIS invalide.".into());
            }
            Ok(text.into_owned())
        }
    }
    fn strings(&mut self) -> Result<()> {
        for _ in 0..self.count(10_000)? {
            self.string()?;
        }
        Ok(())
    }
    fn ints(&mut self) -> Result<()> {
        let n = self.count(10_000)?;
        self.take(n * 4)?;
        Ok(())
    }
    pub fn finish(&self) -> Result<()> {
        if self.pos != self.bytes.len() {
            return Err("WOLF: données supplémentaires inconnues.".into());
        }
        Ok(())
    }
}

pub fn int(out: &mut Vec<u8>, value: u32) {
    out.extend(value.to_le_bytes());
}
pub fn string(out: &mut Vec<u8>, text: &str, utf8: bool) -> Result<()> {
    if text.contains('\0') {
        return Err("WOLF: caractère nul interdit.".into());
    }
    let bytes = if utf8 {
        text.as_bytes().to_vec()
    } else {
        let (bytes, _, failed) = SHIFT_JIS.encode(text);
        if failed {
            return Err("Texte non représentable en Shift-JIS pour ce jeu WOLF 2.".into());
        }
        bytes.into_owned()
    };
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("WOLF: texte trop long.".into());
    }
    int(out, (bytes.len() + 1) as u32);
    out.extend(bytes);
    out.push(0);
    Ok(())
}

pub fn payload(
    bytes: &[u8],
    kind: u8,
    compressed_versions: &[u8],
) -> Result<(Vec<u8>, bool, bool)> {
    if bytes.len() > LIMIT {
        return Err("WOLF: fichier supérieur à 64 Mo.".into());
    }
    if bytes.len() < 15
        || bytes[..6] != [0, b'W', 0, 0, b'O', b'L']
        || ![0, 0x55].contains(&bytes[6])
        || bytes[7..10] != [b'F', kind, 0]
    {
        return Err(
            "WOLF: données protégées ou format inconnu. Le jeu n’a pas été modifié.".into(),
        );
    }
    let packed = compressed_versions.contains(&bytes[10]);
    let data = if packed {
        let mut r = Reader {
            bytes: &bytes[11..],
            pos: 0,
            utf8: false,
        };
        let size = r.count(LIMIT)?;
        let compressed = r.count(LIMIT)?;
        let input = r.take(compressed)?;
        r.finish()?;
        let data =
            lz4_flex::block::decompress(input, size).map_err(|_| "WOLF: bloc LZ4 invalide.")?;
        if data.len() != size {
            return Err("WOLF: taille LZ4 incohérente.".into());
        }
        data
    } else {
        bytes[11..].to_vec()
    };
    Ok((data, bytes[6] == 0x55, packed))
}

#[derive(Clone, Debug)]
pub struct Command {
    pub code: u32,
    pub args: Vec<i32>,
    pub texts: Vec<String>,
    pub depth: u8,
    pub route: Vec<u8>,
}
impl Command {
    pub fn new(code: u32, args: &[i32], texts: &[&str], depth: u8) -> Self {
        Self {
            code,
            args: args.to_vec(),
            texts: texts.iter().map(|s| s.to_string()).collect(),
            depth,
            route: Vec::new(),
        }
    }
    pub fn write(&self, out: &mut Vec<u8>, utf8: bool, modern: bool) -> Result<()> {
        if self.args.len() > 254 || self.texts.len() > 255 {
            return Err("WOLF: commande trop longue.".into());
        }
        out.push((self.args.len() + 1) as u8);
        int(out, self.code);
        for arg in &self.args {
            int(out, *arg as u32);
        }
        out.push(self.depth);
        out.push(self.texts.len() as u8);
        for text in &self.texts {
            string(out, text, utf8)?;
        }
        out.push(u8::from(!self.route.is_empty()));
        out.extend(&self.route);
        if modern {
            out.push(0);
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct Event {
    pub id: u32,
    pub name: String,
    pub commands: Vec<Command>,
    pub span: Range<usize>,
}
pub struct Definition {
    pub name: String,
    pub run: u8,
    pub condition: u32,
    pub threshold: u32,
    pub commands: Vec<Command>,
}
pub struct CommonEvents {
    original: Vec<u8>,
    pub data: Vec<u8>,
    pub events: Vec<Event>,
    pub utf8: bool,
    pub modern: bool,
    footer: u8,
}
impl CommonEvents {
    pub fn read(bytes: &[u8]) -> Result<Self> {
        let (data, utf8, modern) = payload(bytes, b'C', &[0x93, 0xcc])?;
        let mut r = Reader {
            bytes: &data,
            pos: 0,
            utf8,
        };
        let count = r.count(10_000)?;
        let mut events = Vec::with_capacity(count);
        let mut total_commands = 0usize;
        for index in 0..count {
            let start = r.pos;
            r.expect(0x8e)?;
            let id = r.int()?;
            if id != index as u32 {
                return Err("WOLF: identifiants de common events non séquentiels.".into());
            }
            r.take(11)?;
            let name = r.string()?;
            let length = r.count(1_000_000)?;
            total_commands += length;
            if total_commands > 1_000_000 {
                return Err("WOLF: trop de commandes.".into());
            }
            let mut commands = Vec::with_capacity(length);
            for _ in 0..length {
                let n = r.byte()?;
                if n == 0 {
                    return Err("WOLF: commande vide inconnue.".into());
                }
                let code = r.int()?;
                let mut args = Vec::new();
                for _ in 1..n {
                    args.push(r.int()? as i32);
                }
                let depth = r.byte()?;
                let strings = r.byte()?;
                let mut texts = Vec::new();
                for _ in 0..strings {
                    texts.push(r.string()?);
                }
                let terminator = r.byte()?;
                if terminator > 1 {
                    return Err("WOLF: terminaison de commande inconnue.".into());
                }
                let route_start = r.pos;
                if terminator == 1 {
                    r.take(6)?;
                    for _ in 0..r.count(100_000)? {
                        r.byte()?;
                        let ints = r.byte()? as usize;
                        r.take(ints * 4)?;
                        let bytes = r.byte()? as usize;
                        r.take(bytes)?;
                    }
                }
                let route = data[route_start..r.pos].to_vec();
                if modern {
                    let n = r.byte()? as usize;
                    r.take(n)?;
                }
                commands.push(Command {
                    code,
                    args,
                    texts,
                    depth,
                    route,
                });
            }
            r.string()?;
            r.string()?;
            r.expect(0x8f)?;
            r.strings()?;
            let n = r.count(10_000)?;
            r.take(n)?;
            for _ in 0..r.count(10_000)? {
                r.strings()?;
            }
            for _ in 0..r.count(10_000)? {
                r.ints()?;
            }
            r.take(29)?;
            for _ in 0..100 {
                r.string()?;
            }
            r.expect(0x91)?;
            r.string()?;
            match r.byte()? {
                0x91 => (),
                0x92 => {
                    r.string()?;
                    r.int()?;
                    r.expect(0x92)?;
                }
                _ => return Err("WOLF: fin de common event inconnue.".into()),
            }
            events.push(Event {
                id,
                name,
                commands,
                span: start..r.pos,
            });
        }
        let footer = r.byte()?;
        if footer < 0x89 {
            return Err("WOLF: terminaison de fichier inconnue.".into());
        }
        r.finish()?;
        Ok(Self {
            original: bytes.to_vec(),
            data,
            events,
            utf8,
            modern,
            footer,
        })
    }
    pub fn original(&self) -> &[u8] {
        &self.original
    }
    pub fn append(&self, added: &[(String, u8, Vec<Command>)]) -> Result<Vec<u8>> {
        let added: Vec<_> = added
            .iter()
            .map(|(name, run, commands)| Definition {
                name: name.clone(),
                run: 0x20 | *run,
                condition: 2_000_000,
                threshold: 0,
                commands: commands.clone(),
            })
            .collect();
        self.append_events(&added)
    }
    pub fn append_events(&self, added: &[Definition]) -> Result<Vec<u8>> {
        if self.events.len() + added.len() > 10_000 {
            return Err("WOLF: limite de common events atteinte.".into());
        }
        let mut data = Vec::new();
        int(&mut data, (self.events.len() + added.len()) as u32);
        data.extend(&self.data[4..self.data.len() - 1]);
        for (index, def) in added.iter().enumerate() {
            data.push(0x8e);
            int(&mut data, (self.events.len() + index) as u32);
            data.push(def.run);
            int(&mut data, def.condition);
            int(&mut data, def.threshold);
            data.extend([0, 0]);
            string(&mut data, &def.name, self.utf8)?;
            int(&mut data, (def.commands.len() + 1) as u32);
            for command in &def.commands {
                command.write(&mut data, self.utf8, self.modern)?;
            }
            Command::new(0, &[], &[], 0).write(&mut data, self.utf8, self.modern)?;
            string(&mut data, "", self.utf8)?;
            string(&mut data, "", self.utf8)?;
            data.push(0x8f);
            int(&mut data, 10);
            for _ in 0..10 {
                string(&mut data, "", self.utf8)?;
            }
            int(&mut data, 10);
            data.extend([0; 10]);
            int(&mut data, 10);
            for _ in 0..10 {
                int(&mut data, 0);
            }
            int(&mut data, 10);
            for _ in 0..10 {
                int(&mut data, 0);
            }
            int(&mut data, 5);
            for _ in 0..5 {
                int(&mut data, 0);
            }
            data.push(0x90);
            int(&mut data, 2);
            for _ in 0..100 {
                string(&mut data, "", self.utf8)?;
            }
            data.push(0x91);
            string(&mut data, "", self.utf8)?;
            data.push(0x92);
            string(&mut data, "", self.utf8)?;
            int(&mut data, 0);
            data.push(0x92);
        }
        data.push(self.footer);
        if data.len() > LIMIT {
            return Err("WOLF: résultat supérieur à 64 Mo.".into());
        }
        let mut out = self.original[..11].to_vec();
        if self.modern {
            let compressed = lz4_flex::block::compress(&data);
            int(&mut out, data.len() as u32);
            int(&mut out, compressed.len() as u32);
            out.extend(compressed);
        } else {
            out.extend(data);
        }
        Self::read(&out)?;
        Ok(out)
    }
}
