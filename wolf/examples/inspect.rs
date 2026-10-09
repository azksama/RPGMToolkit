use std::path::PathBuf;
use wolf_toolkit::install::{self, Bundle};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("Usage: inspect <original-BasicData-directory>")?,
    );
    let read = |name: &str| std::fs::read(base.join(name)).map(|bytes| install::encode(&bytes));
    let optional = |name: &str| {
        if base.join(name).exists() {
            read(name).map(Some)
        } else {
            Ok(None)
        }
    };
    let bundle = Bundle {
        common: read("CommonEvent.dat")?,
        original: None,
        system: read("SysDatabase.dat")?,
        system_names: optional("SysDatabase.project")?,
        mutable: read("CDataBase.dat")?,
        mutable_names: optional("CDataBase.project")?,
        marker: None,
        catalog: None,
        game: read("Game.dat")?,
        original_game: None,
    };
    let original = serde_json::to_string(&bundle)?;
    let checked = install::inspect(&original)?;
    let installed = install::patch(&original, false)?;
    let removed = install::patch(&installed, true)?;
    assert_eq!(checked.fingerprint, install::inspect(&removed)?.fingerprint);
    println!(
        "{} events, {} fields; installation and exact restoration verified in memory.",
        checked.event_count,
        checked.entries.len()
    );
    Ok(())
}
