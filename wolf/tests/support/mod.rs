use wolf_toolkit::{
    codec::{self, Command, CommonEvents},
    install,
};

pub fn header(kind: u8, modern: bool) -> Vec<u8> {
    vec![
        0,
        b'W',
        0,
        0,
        b'O',
        b'L',
        if modern { 0x55 } else { 0 },
        b'F',
        kind,
        0,
        if modern {
            if kind == b'C' {
                0x93
            } else {
                0xc4
            }
        } else {
            0x90
        },
    ]
}
pub fn wrap(kind: u8, modern: bool, data: &[u8]) -> Vec<u8> {
    let mut bytes = header(kind, modern);
    if modern {
        let packed = lz4_flex::block::compress(data);
        codec::int(&mut bytes, data.len() as u32);
        codec::int(&mut bytes, packed.len() as u32);
        bytes.extend(packed)
    } else {
        bytes.extend(data)
    }
    bytes
}
pub fn common(modern: bool) -> Vec<u8> {
    let blank = wrap(b'C', modern, &[0, 0, 0, 0, 0x89]);
    CommonEvents::read(&blank)
        .unwrap()
        .append(&[(
            "Original 日本語".into(),
            0,
            vec![Command::new(
                122,
                &[3_000_000, 0],
                &["Original \"text\""],
                0,
            )],
        )])
        .unwrap()
}
pub fn db(system: bool, modern: bool) -> Vec<u8> {
    let mut data = Vec::new();
    let count = if system { 24 } else { 1 };
    codec::int(&mut data, count);
    for ty in 0..count {
        data.extend([0xfe, 0xff, 0xff, 0xff]);
        codec::int(&mut data, 0);
        codec::int(&mut data, if system { 1 } else { 2 });
        if !system {
            codec::int(&mut data, 1000)
        }
        codec::int(&mut data, 2000);
        let rows = if system {
            if ty == 4 {
                2
            } else if ty >= 14 {
                3
            } else {
                0
            }
        } else {
            2
        };
        codec::int(&mut data, rows);
        for n in 0..rows {
            if !system {
                codec::int(&mut data, n)
            }
            codec::string(&mut data, &format!("名前{n}"), modern).unwrap()
        }
    }
    data.push(0xc1);
    wrap(b'M', modern, &data)
}
pub fn bundle(modern: bool) -> String {
    serde_json::to_string(&install::Bundle {
        common: install::encode(&common(modern)),
        original: None,
        system: install::encode(&db(true, modern)),
        system_names: None,
        mutable: install::encode(&db(false, modern)),
        mutable_names: None,
        marker: None,
        catalog: None,
        game: install::encode(&game(modern)),
        original_game: None,
    })
    .unwrap()
}
pub fn large_bundle(modern: bool, rows: u32, columns: u32) -> String {
    assert!(rows <= 10_000 && columns > 0 && columns <= 100);
    let mut bundle: install::Bundle = serde_json::from_str(&bundle(modern)).unwrap();
    let mut data = Vec::new();
    codec::int(&mut data, 1);
    data.extend([0xfe, 0xff, 0xff, 0xff]);
    codec::int(&mut data, 0);
    codec::int(&mut data, columns);
    let mut ints = 0;
    let mut strings = 0;
    for column in 0..columns {
        codec::int(
            &mut data,
            if column % 2 == 0 {
                let field = 1000 + ints;
                ints += 1;
                field
            } else {
                let field = 2000 + strings;
                strings += 1;
                field
            },
        );
    }
    codec::int(&mut data, rows);
    for row in 0..rows {
        for column in 0..ints {
            codec::int(&mut data, row * 100 + column * 2);
        }
        for _ in 0..strings {
            codec::string(&mut data, &format!("row-{row}"), modern).unwrap();
        }
    }
    data.push(0xc1);
    bundle.mutable = install::encode(&wrap(b'M', modern, &data));
    serde_json::to_string(&bundle).unwrap()
}
pub fn game(modern: bool) -> Vec<u8> {
    let mut bytes = vec![
        0,
        b'W',
        0,
        0,
        b'O',
        b'L',
        0,
        b'F',
        b'M',
        if modern { 0x55 } else { 0 },
    ];
    codec::int(&mut bytes, 22);
    bytes.extend([0; 22]);
    codec::int(&mut bytes, 9);
    for _ in 0..9 {
        codec::string(&mut bytes, "", modern).unwrap()
    }
    let size = bytes.len();
    codec::int(&mut bytes, 0);
    codec::int(&mut bytes, 0);
    codec::int(&mut bytes, 19);
    bytes.extend([0; 38]);
    bytes.extend([0; 8]);
    bytes.push(0x89);
    let length = (bytes.len() - 1) as u32;
    bytes[size..size + 4].copy_from_slice(&length.to_le_bytes());
    bytes
}
