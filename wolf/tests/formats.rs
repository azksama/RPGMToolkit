use wolf_toolkit::{
    catalog,
    codec::{self, Command, CommonEvents},
    install,
};

mod support;
use support::*;

#[test]
fn records_and_final_sentinel_are_preserved_in_both_encodings() {
    for modern in [false, true] {
        let source = CommonEvents::read(&common(modern)).unwrap();
        let patched = source
            .append(&[(
                "Toolkit test".into(),
                3,
                vec![Command::new(180, &[1], &[], 0)],
            )])
            .unwrap();
        let next = CommonEvents::read(&patched).unwrap();
        assert_eq!(
            &source.data[source.events[0].span.clone()],
            &next.data[next.events[0].span.clone()]
        );
        assert_eq!(next.events[1].commands.last().unwrap().code, 0);
        assert_eq!(next.events[1].commands[0].args, [1]);
        assert_eq!(next.modern, modern);
        assert_eq!(next.utf8, modern);
    }
}
#[test]
fn install_update_uninstall_is_idempotent_and_exact() {
    for modern in [false, true] {
        let original = bundle(modern);
        let before = install::inspect(&original).unwrap();
        let installed = install::patch(&original, false).unwrap();
        let checked = install::inspect(&installed).unwrap();
        assert_eq!(checked.code.as_deref(), Some(install::CODE));
        assert_eq!(checked.entries.len(), 36);
        assert_eq!(install::patch(&installed, false).unwrap(), installed);
        let removed = install::patch(&installed, true).unwrap();
        let clean = install::inspect(&removed).unwrap();
        assert_eq!(before.bundle.common, clean.bundle.common);
        assert_eq!(before.fingerprint, clean.fingerprint);
        assert!(clean.code.is_none());
    }
}
#[test]
fn catalogue_addresses_are_distinct_and_numeric_types_are_retained() {
    let events = CommonEvents::read(&common(false)).unwrap();
    let types = catalog::database(&db(true, false)).unwrap();
    let mut entries = catalog::variables(&types, &[]).unwrap();
    entries.extend(catalog::mutable(
        &catalog::database(&db(false, false)).unwrap(),
        &[],
    ));
    assert_eq!(entries[0].reference, 2_000_000);
    assert_eq!(entries[3].reference, 3_000_000);
    assert_eq!(entries[5].reference, 2_100_000);
    assert!(entries[3].string);
    assert!(!entries[0].string);
    assert_eq!(events.events.len(), 1);
    assert_eq!(
        entries
            .iter()
            .map(|e| e.reference)
            .collect::<std::collections::HashSet<_>>()
            .len(),
        entries.len()
    );
    assert_eq!(entries[32].reference, 1_100_000_000);
    assert!(!entries[32].string);
    assert!(entries[33].string);
}
#[test]
fn changed_schema_catalogue_or_install_files_are_refused() {
    let installed = install::patch(&bundle(false), false).unwrap();
    for key in [
        "common",
        "original",
        "system",
        "mutable",
        "catalog",
        "marker",
        "game",
        "originalGame",
    ] {
        let mut changed: serde_json::Value = serde_json::from_str(&installed).unwrap();
        changed[key] = serde_json::Value::String(format!("{}x", changed[key].as_str().unwrap()));
        assert!(install::inspect(&changed.to_string()).is_err(), "{key}");
    }
}
#[test]
fn background_patch_changes_only_the_inactive_flag_and_restores_it() {
    for modern in [false, true] {
        let original = game(modern);
        let patched = wolf_toolkit::game::background(&original).unwrap();
        assert_eq!(patched[33], 1);
        assert_eq!(
            original
                .iter()
                .zip(&patched)
                .enumerate()
                .filter(|(_, (a, b))| a != b)
                .map(|(n, _)| n)
                .collect::<Vec<_>>(),
            [33]
        );
        let installed = install::patch(&bundle(modern), false).unwrap();
        let clean = install::patch(&installed, true).unwrap();
        assert_eq!(
            install::inspect(&clean).unwrap().bundle.game,
            install::encode(&original)
        );
    }
}
#[test]
fn malformed_and_overlarge_structures_are_rejected() {
    let source = common(false);
    for end in [0, 10, 15, source.len() - 1] {
        assert!(CommonEvents::read(&source[..end]).is_err())
    }
    let mut bad = header(b'C', true);
    codec::int(&mut bad, u32::MAX);
    codec::int(&mut bad, 0);
    assert!(CommonEvents::read(&bad).is_err());
    let mut bad = wrap(b'C', false, &[0, 0, 0, 0, 0x89]);
    bad[11..15].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(CommonEvents::read(&bad).is_err());
    let mut text = vec![];
    codec::int(&mut text, 2);
    text.extend([0xff, 0]);
    assert!(codec::Reader {
        bytes: &text,
        pos: 0,
        utf8: true
    }
    .string()
    .is_err());
}

#[test]
fn large_catalogues_install_update_and_restore_in_both_formats() {
    for modern in [false, true] {
        let original = large_bundle(modern, 10_000, 10);
        let before = install::inspect(&original).unwrap();
        assert_eq!(before.entries.len(), 100_032);
        let installed = install::patch(&original, false).unwrap();
        let checked = install::inspect(&installed).unwrap();
        assert!(checked.bundle.catalog.as_ref().unwrap().len() > 8 * 1024 * 1024);
        let events = CommonEvents::read(
            &base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                &checked.bundle.common,
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(events.events.len() - before.event_count, 206);
        assert!(
            events
                .events
                .iter()
                .map(|e| e.commands.len())
                .sum::<usize>()
                < 25_000
        );
        assert_eq!(checked.entries.last().unwrap().reference, 1_100_999_909);
        assert_eq!(checked.entries, before.entries);
        assert_eq!(install::patch(&installed, false).unwrap(), installed);
        assert_eq!(
            install::inspect(&install::patch(&installed, true).unwrap())
                .unwrap()
                .fingerprint,
            before.fingerprint
        );
    }
}

#[test]
fn catalogue_validation_checks_every_field_and_rejects_extra_data() {
    let entries = install::inspect(&bundle(true)).unwrap().entries;
    let text = catalog::serialize(&entries).unwrap();
    catalog::validate(&text, &entries).unwrap();
    assert!(catalog::validate(&text, &entries[..entries.len() - 1]).is_err());
    assert!(catalog::validate("[]", &entries).is_err());
    assert!(catalog::validate(&(text.clone() + " []"), &entries).is_err());
    let mut changed = entries.clone();
    changed.last_mut().unwrap().name = "Different".into();
    assert!(catalog::validate(&text, &changed).is_err());
}
