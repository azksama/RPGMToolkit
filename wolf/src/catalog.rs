use crate::{
    codec::{payload, Reader},
    Result,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DatabaseType {
    pub fields: Vec<bool>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Clone, Debug)]
pub struct Names {
    pub name: String,
    pub fields: Vec<String>,
    pub rows: Vec<String>,
}

pub fn project(bytes: &[u8], utf8: bool) -> Result<Vec<Names>> {
    if bytes.len() > crate::LIMIT {
        return Err("WOLF: fichier project trop grand.".into());
    }
    let mut r = Reader {
        bytes,
        pos: 0,
        utf8,
    };
    let mut out = Vec::new();
    for _ in 0..r.count(100)? {
        let name = r.string()?;
        let mut fields = Vec::new();
        for _ in 0..r.count(100)? {
            fields.push(r.string()?);
        }
        let mut rows = Vec::new();
        for _ in 0..r.count(10_000)? {
            rows.push(r.string()?);
        }
        r.string()?;
        let n = r.count(100)?;
        r.take(n)?;
        for _ in 0..r.count(100)? {
            r.string()?;
        }
        for _ in 0..r.count(100)? {
            for _ in 0..r.count(10_000)? {
                r.string()?;
            }
        }
        for _ in 0..r.count(100)? {
            let n = r.count(10_000)?;
            r.take(n * 4)?;
        }
        let n = r.count(100)?;
        r.take(n * 4)?;
        out.push(Names { name, fields, rows });
    }
    r.finish()?;
    Ok(out)
}

pub fn database(bytes: &[u8]) -> Result<Vec<DatabaseType>> {
    let (data, utf8, _) = payload(bytes, b'M', &[0xc4])?;
    let mut r = Reader {
        bytes: &data,
        pos: 0,
        utf8,
    };
    let count = r.count(100)?;
    let mut types = Vec::new();
    let mut total = 0usize;
    for _ in 0..count {
        r.expect(0xfe)?;
        r.expect(0xff)?;
        r.expect(0xff)?;
        r.expect(0xff)?;
        let method = r.int()?;
        let mut mapping = Vec::new();
        let fields = r.count(100)?;
        if method == 120_000 {
            r.string()?;
        }
        for _ in 0..fields {
            mapping.push(r.int()?);
        }
        let ints = mapping.iter().filter(|v| **v >= 1000 && **v < 2000).count();
        let strings = mapping.iter().filter(|v| **v >= 2000 && **v < 3000).count();
        if ints + strings != mapping.len()
            || mapping
                .iter()
                .copied()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != mapping.len()
            || mapping
                .iter()
                .any(|v| (*v % 1000) as usize >= if *v < 2000 { ints } else { strings })
        {
            return Err("WOLF: schéma de base de données inconnu.".into());
        }
        let count = r.count(10_000)?;
        total += count * mapping.len();
        if total > 1_000_000 {
            return Err("WOLF: base de données trop grande.".into());
        }
        let mut rows = Vec::new();
        for _ in 0..count {
            r.take(ints * 4)?;
            let mut values = Vec::new();
            for _ in 0..strings {
                values.push(r.string()?);
            }
            rows.push(
                mapping
                    .iter()
                    .map(|v| {
                        if *v >= 2000 {
                            values[(*v % 1000) as usize].clone()
                        } else {
                            String::new()
                        }
                    })
                    .collect(),
            );
        }
        types.push(DatabaseType {
            fields: mapping.iter().map(|v| *v >= 2000).collect(),
            rows,
        });
    }
    r.byte()?;
    r.finish()?;
    Ok(types)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Entry {
    pub reference: i32,
    pub name: String,
    pub string: bool,
    pub group: String,
    pub alias: Option<String>,
}

pub fn variables(system: &[DatabaseType], names: &[Names]) -> Result<Vec<Entry>> {
    let mut out = Vec::new();
    for (type_id, base, is_string, group) in [
        (14, 2_000_000, false, "Variables"),
        (4, 3_000_000, true, "Strings"),
    ] {
        let ty = system
            .get(type_id)
            .ok_or("WOLF: liste des variables système absente.")?;
        for (id, row) in ty.rows.iter().enumerate() {
            out.push(Entry {
                reference: base + id as i32,
                name: names
                    .get(type_id)
                    .and_then(|n| n.rows.get(id))
                    .filter(|n| !n.is_empty())
                    .cloned()
                    .or_else(|| row.first().filter(|n| !n.is_empty()).cloned())
                    .unwrap_or_else(|| format!("#{id}")),
                string: is_string,
                group: group.into(),
                alias: None,
            });
        }
    }
    for group in 1..=9 {
        if let Some(ty) = system.get(14 + group) {
            for id in 0..ty.rows.len() {
                out.push(Entry {
                    reference: 2_000_000 + group as i32 * 100_000 + id as i32,
                    name: names
                        .get(14 + group)
                        .and_then(|n| n.rows.get(id))
                        .filter(|n| !n.is_empty())
                        .cloned()
                        .unwrap_or_else(|| format!("V{group}-{id}")),
                    string: false,
                    group: format!("Spare {group}"),
                    alias: None,
                });
            }
        }
    }
    Ok(out)
}

pub fn mutable(types: &[DatabaseType], names: &[Names]) -> Vec<Entry> {
    let mut entries = Vec::new();
    for (ty, data) in types.iter().enumerate() {
        for (row, values) in data.rows.iter().enumerate() {
            let name = names
                .get(ty)
                .and_then(|n| n.rows.get(row))
                .filter(|n| !n.is_empty())
                .cloned()
                .or_else(|| values.iter().find(|v| !v.is_empty()).cloned())
                .unwrap_or_else(|| format!("#{row}"));
            for (field, string) in data.fields.iter().enumerate() {
                entries.push(Entry {
                    reference: 1_100_000_000
                        + ty as i32 * 1_000_000
                        + row as i32 * 100
                        + field as i32,
                    name: format!(
                        "{name} / {}",
                        names
                            .get(ty)
                            .and_then(|n| n.fields.get(field))
                            .filter(|n| !n.is_empty())
                            .cloned()
                            .unwrap_or_else(|| field.to_string())
                    ),
                    string: *string,
                    group: names
                        .get(ty)
                        .map(|n| n.name.clone())
                        .filter(|n| !n.is_empty())
                        .unwrap_or_else(|| format!("DB {ty}")),
                    alias: None,
                });
            }
        }
    }
    entries
}
