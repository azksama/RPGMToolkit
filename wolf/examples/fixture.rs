#[path = "../tests/support/mod.rs"]
mod support;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let directory = std::path::PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("Usage: fixture <new-directory>")?,
    );
    std::fs::create_dir(&directory)?;
    let rows: Option<u32> = std::env::args().nth(2).map(|n| n.parse()).transpose()?;
    let columns: u32 = std::env::args()
        .nth(3)
        .map(|n| n.parse())
        .transpose()?
        .unwrap_or(10);
    for modern in [false, true] {
        let original = match rows {
            Some(rows) => support::large_bundle(modern, rows, columns),
            None => support::bundle(modern),
        };
        let installed = wolf_toolkit::install::patch(&original, false)?;
        let version = if modern { 3 } else { 2 };
        std::fs::write(
            directory.join(format!("wolf-{version}-original.json")),
            original,
        )?;
        std::fs::write(
            directory.join(format!("wolf-{version}-installed.json")),
            installed,
        )?;
    }
    Ok(())
}
