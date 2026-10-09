use crate::engine::{Inspection, Snapshot};
pub use wolf_toolkit::install::CODE;
pub fn is_wolf(engine: &str) -> bool {
    engine == "WOLF"
}
pub fn inspect(registry: String, mut info: Inspection) -> Result<Snapshot, String> {
    let checked = wolf_toolkit::install::inspect(&registry)?;
    info.status = if checked.code.is_some() {
        "installed"
    } else {
        "absent"
    }
    .into();
    info.fingerprint = checked.fingerprint;
    info.plugin_count = checked.event_count;
    Ok(Snapshot {
        info,
        registry,
        previous_mod: checked.code,
    })
}
pub fn patch(registry: &str, uninstall: bool) -> Result<String, String> {
    wolf_toolkit::install::patch(registry, uninstall)
}
