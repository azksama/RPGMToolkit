use crate::{bridge, catalog, codec::CommonEvents, Result, LIMIT, VERSION};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const CODE: &str = concat!("WOLF Toolkit ", env!("CARGO_PKG_VERSION"));
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn encode(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}
fn decode(text: &str) -> Result<Vec<u8>> {
    if text.len() > LIMIT * 4 / 3 + 4 {
        return Err("WOLF: fichier trop volumineux.".into());
    }
    STANDARD
        .decode(text)
        .map_err(|_| "WOLF: données Base64 invalides.".into())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    pub common: String,
    pub original: Option<String>,
    pub system: String,
    pub system_names: Option<String>,
    pub mutable: String,
    pub mutable_names: Option<String>,
    pub marker: Option<String>,
    pub catalog: Option<String>,
    pub game: String,
    pub original_game: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Marker {
    pub format: u32,
    pub version: String,
    pub code: String,
    pub original_sha256: String,
    pub common_sha256: String,
    pub catalog_sha256: String,
    pub schema_sha256: String,
    pub event_start: usize,
    pub game_sha256: String,
    pub original_game_sha256: String,
}
pub struct Checked {
    pub bundle: Bundle,
    pub entries: Vec<catalog::Entry>,
    pub code: Option<String>,
    pub fingerprint: String,
    pub event_count: usize,
}

fn schema(bundle: &Bundle) -> String {
    hash(
        serde_json::to_string(&(
            &bundle.system,
            &bundle.system_names,
            &bundle.mutable,
            &bundle.mutable_names,
        ))
        .unwrap()
        .as_bytes(),
    )
}
fn entries(bundle: &Bundle, events: &CommonEvents) -> Result<Vec<catalog::Entry>> {
    let system = catalog::database(&decode(&bundle.system)?)?;
    let names = bundle
        .system_names
        .as_ref()
        .map(|s| decode(s).and_then(|b| catalog::project(&b, events.utf8)))
        .transpose()?
        .unwrap_or_default();
    let mut entries = catalog::variables(&system, &names)?;
    let mutable = catalog::database(&decode(&bundle.mutable)?)?;
    let names = bundle
        .mutable_names
        .as_ref()
        .map(|s| decode(s).and_then(|b| catalog::project(&b, events.utf8)))
        .transpose()?
        .unwrap_or_default();
    entries.extend(catalog::mutable(&mutable, &names));
    if entries.is_empty() || entries.len() > 20_000 {
        return Err("WOLF: 1 à 20 000 champs sont pris en charge.".into());
    }
    Ok(entries)
}
pub fn inspect(text: &str) -> Result<Checked> {
    if text.len() > LIMIT * 4 {
        return Err("WOLF: dossier trop volumineux.".into());
    }
    let bundle: Bundle =
        serde_json::from_str(text).map_err(|_| "WOLF: dossier incomplet.".to_string())?;
    let events = CommonEvents::read(&decode(&bundle.common)?)?;
    let source = if let Some(original) = &bundle.original {
        CommonEvents::read(&decode(original)?)?
    } else {
        CommonEvents::read(events.original())?
    };
    let entries = entries(&bundle, &source)?;
    let game = decode(&bundle.game)?;
    let original_game = bundle
        .original_game
        .as_deref()
        .map(decode)
        .transpose()?
        .unwrap_or_else(|| game.clone());
    let background = crate::game::background(&original_game)?;
    let code = if let Some(marker) = &bundle.marker {
        let marker: Marker =
            serde_json::from_str(marker).map_err(|_| "WOLF: manifeste du mod invalide.")?;
        if marker.format != 1
            || bundle.original.is_none()
            || bundle.original_game.is_none()
            || marker.original_sha256 != hash(source.original())
            || marker.common_sha256 != hash(events.original())
            || marker.schema_sha256 != schema(&bundle)
            || marker.event_start != source.events.len()
            || marker.game_sha256 != hash(&game)
            || marker.original_game_sha256 != hash(&original_game)
            || game != background
        {
            return Err(
                "WOLF: les fichiers installés ont changé. Restauration manuelle requise.".into(),
            );
        }
        let text = bundle
            .catalog
            .as_ref()
            .ok_or("WOLF: catalogue installé absent.")?;
        if marker.catalog_sha256 != hash(text.as_bytes()) {
            return Err("WOLF: catalogue modifié.".into());
        }
        let installed: Vec<catalog::Entry> =
            serde_json::from_str(text).map_err(|_| "WOLF: catalogue invalide.")?;
        if serde_json::to_vec(&installed).unwrap() != serde_json::to_vec(&entries).unwrap() {
            return Err("WOLF: le schéma du jeu a changé.".into());
        }
        if source.events.len() >= events.events.len()
            || source.events.iter().any(|e| {
                events.data[events.events[e.id as usize].span.clone()]
                    != source.data[e.span.clone()]
            })
        {
            return Err("WOLF: événements d’origine modifiés.".into());
        }
        Some(marker.code)
    } else {
        if bundle.original.is_some()
            || bundle.original_game.is_some()
            || bundle.catalog.is_some()
            || events
                .events
                .iter()
                .any(|e| e.name.starts_with("[WOLF Toolkit"))
        {
            return Err("WOLF: installation partielle. Restaurez la copie originale.".into());
        }
        None
    };
    let fingerprint = fingerprint(&bundle);
    Ok(Checked {
        event_count: source.events.len(),
        bundle,
        entries,
        code,
        fingerprint,
    })
}
pub fn fingerprint(bundle: &Bundle) -> String {
    let mut digest = Sha256::new();
    for text in [
        Some(&bundle.common),
        bundle.original.as_ref(),
        Some(&bundle.system),
        bundle.system_names.as_ref(),
        Some(&bundle.mutable),
        bundle.mutable_names.as_ref(),
        bundle.marker.as_ref(),
        bundle.catalog.as_ref(),
        Some(&bundle.game),
        bundle.original_game.as_ref(),
    ] {
        digest.update(text.map(String::as_bytes).unwrap_or(&[0]));
        digest.update([0xff]);
    }
    format!("{:x}", digest.finalize())
}
pub fn patch(text: &str, uninstall: bool) -> Result<String> {
    let checked = inspect(text)?;
    let mut bundle = checked.bundle;
    let original = bundle
        .original
        .clone()
        .unwrap_or_else(|| bundle.common.clone());
    let original_game = bundle
        .original_game
        .clone()
        .unwrap_or_else(|| bundle.game.clone());
    if uninstall {
        bundle.common = original;
        bundle.original = None;
        bundle.marker = None;
        bundle.catalog = None;
        bundle.game = original_game;
        bundle.original_game = None;
    } else {
        let original_bytes = decode(&original)?;
        let source = CommonEvents::read(&original_bytes)?;
        let patched = bridge::compile(&source, &checked.entries)?;
        let original_game_bytes = decode(&original_game)?;
        let game = crate::game::background(&original_game_bytes)?;
        let catalog = serde_json::to_string(&checked.entries).map_err(|e| e.to_string())?;
        bundle.marker = Some(
            serde_json::to_string(&Marker {
                format: 1,
                version: VERSION.into(),
                code: CODE.into(),
                original_sha256: hash(&original_bytes),
                common_sha256: hash(&patched),
                catalog_sha256: hash(catalog.as_bytes()),
                schema_sha256: schema(&bundle),
                event_start: source.events.len(),
                game_sha256: hash(&game),
                original_game_sha256: hash(&original_game_bytes),
            })
            .unwrap(),
        );
        bundle.common = encode(&patched);
        bundle.original = Some(original);
        bundle.catalog = Some(catalog);
        bundle.game = encode(&game);
        bundle.original_game = Some(original_game);
    }
    let output = serde_json::to_string(&bundle).map_err(|e| e.to_string())?;
    inspect(&output)?;
    Ok(output)
}

pub struct Files {
    pub common: Vec<u8>,
    pub original: Option<Vec<u8>>,
    pub catalog: Option<String>,
    pub marker: Option<String>,
    pub game: Vec<u8>,
    pub original_game: Option<Vec<u8>>,
}
pub fn files(text: &str) -> Result<Files> {
    let bundle = inspect(text)?.bundle;
    Ok(Files {
        common: decode(&bundle.common)?,
        original: bundle.original.as_ref().map(|s| decode(s)).transpose()?,
        catalog: bundle.catalog,
        marker: bundle.marker,
        game: decode(&bundle.game)?,
        original_game: bundle
            .original_game
            .as_ref()
            .map(|s| decode(s))
            .transpose()?,
    })
}
