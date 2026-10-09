use serde_json::Value;
use std::{
    io::{Read, Write},
    path::Path,
};

const INLINE_LIMIT: usize = 1024 * 1024;
const FILE_LIMIT: usize = 256 * 1024 * 1024;

pub fn needs_file(command: &str, args: &Value) -> bool {
    command == "applyFolder"
        && args["registry"]
            .as_str()
            .is_some_and(|s| s.len() > INLINE_LIMIT)
}

pub fn invoke(
    command: &str,
    mut args: Value,
    cache: &Path,
    dispatch: impl FnOnce(Value) -> Result<Value, String>,
) -> Result<Value, String> {
    if !needs_file(command, &args) {
        return dispatch(args);
    }
    let Value::String(registry) = args.as_object_mut().unwrap().remove("registry").unwrap() else {
        unreachable!()
    };
    if registry.len() > FILE_LIMIT {
        return Err("Le registre dépasse 256 Mio.".into());
    }
    std::fs::create_dir_all(cache).map_err(|e| format!("Cache indisponible : {e}"))?;
    let mut file = tempfile::Builder::new()
        .prefix("registry-")
        .suffix(".json")
        .tempfile_in(cache)
        .map_err(|e| format!("Création du transfert impossible : {e}"))?;
    file.write_all(registry.as_bytes())
        .and_then(|_| file.flush())
        .map_err(|e| format!("Écriture du transfert impossible : {e}"))?;
    drop(registry);
    args["registryPath"] = Value::String(
        file.path()
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned(),
    );
    let result = dispatch(args);
    drop(file);
    result
}

pub fn receive(mut result: Value, cache: &Path) -> Result<Value, String> {
    let Some(name) = result.get("registryPath") else {
        return Ok(result);
    };
    let name = name.as_str().ok_or("Transfert du registre invalide.")?;
    let stem = name
        .strip_prefix("registry-")
        .and_then(|s| s.strip_suffix(".json"));
    if result.get("registry").is_some()
        || !stem.is_some_and(|s| {
            !s.is_empty()
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
    {
        return Err("Transfert du registre non reconnu.".into());
    }
    let path = cache.join(name);
    let metadata =
        std::fs::symlink_metadata(&path).map_err(|e| format!("Transfert inaccessible : {e}"))?;
    if !metadata.file_type().is_file() {
        return Err("Transfert du registre inaccessible.".into());
    }
    let text = (|| {
        if metadata.len() == 0 || metadata.len() > FILE_LIMIT as u64 {
            return Err("Le registre dépasse 256 Mio.".to_string());
        }
        let mut text = String::with_capacity(metadata.len() as usize);
        std::fs::File::open(&path)
            .and_then(|file| file.take(FILE_LIMIT as u64 + 1).read_to_string(&mut text))
            .map_err(|e| format!("Lecture du transfert impossible : {e}"))?;
        if text.len() > FILE_LIMIT {
            return Err("Le registre dépasse 256 Mio.".into());
        }
        Ok(text)
    })();
    let _ = std::fs::remove_file(&path);
    result.as_object_mut().unwrap().remove("registryPath");
    result["registry"] = Value::String(text?);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn small_payload_stays_inline() {
        let dir = tempfile::tempdir().unwrap();
        let args = json!({"registry":"var $plugins = [];", "token":"game"});
        invoke("applyFolder", args.clone(), dir.path(), |sent| {
            assert_eq!(sent, args);
            Ok(Value::Null)
        })
        .unwrap();
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
        assert!(!needs_file(
            "inspectFolder",
            &json!({"registry":"a".repeat(INLINE_LIMIT+1)})
        ));
    }

    #[test]
    fn oversized_registry_bypasses_json_and_is_removed_on_success_and_error() {
        let dir = tempfile::tempdir().unwrap();
        let registry = "日本語\"\\\n".to_owned() + &"a".repeat(20_054_016);
        for fail in [false, true] {
            let mut staged = None;
            let result = invoke(
                "applyFolder",
                json!({
                    "registry":registry, "token":"game", "expected":"hash", "uninstall":fail
                }),
                dir.path(),
                |sent| {
                    assert!(sent.get("registry").is_none());
                    assert!(serde_json::to_string(&sent).unwrap().len() < 256);
                    assert_eq!(sent["token"], "game");
                    assert_eq!(sent["uninstall"], fail);
                    let path = dir.path().join(sent["registryPath"].as_str().unwrap());
                    assert_eq!(std::fs::read_to_string(&path).unwrap(), registry);
                    staged = Some(path);
                    if fail {
                        Err("native rejection".into())
                    } else {
                        Ok(json!({"applied":true}))
                    }
                },
            );
            assert_eq!(result.is_err(), fail);
            assert!(!staged.unwrap().exists());
        }
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn cache_failure_never_dispatches_apply() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("file");
        std::fs::write(&cache, b"not a directory").unwrap();
        let result = invoke(
            "applyFolder",
            json!({"registry":"a".repeat(INLINE_LIMIT+1)}),
            &cache,
            |_| panic!("An incomplete transfer must not reach the installer"),
        );
        assert!(result.unwrap_err().contains("Cache indisponible"));
    }

    #[test]
    fn large_native_response_is_loaded_and_removed() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("registry-response.json");
        let registry = "日本語".to_owned() + &"a".repeat(20_054_016);
        std::fs::write(&file, &registry).unwrap();
        let result = receive(
            json!({"registryPath":"registry-response.json", "engine":"WOLF"}),
            dir.path(),
        )
        .unwrap();
        assert_eq!(result["registry"], registry);
        assert_eq!(result["engine"], "WOLF");
        assert!(result.get("registryPath").is_none());
        assert!(!file.exists());
    }

    #[test]
    fn invalid_responses_cannot_read_external_files_and_failed_reads_are_removed() {
        let dir = tempfile::tempdir().unwrap();
        let sentinel = dir.path().join("registry-original.json");
        std::fs::write(&sentinel, b"preserved").unwrap();
        for name in ["../registry-original.json", "result-original.zip"] {
            assert!(receive(json!({"registryPath":name}), dir.path()).is_err());
        }
        assert_eq!(std::fs::read_to_string(&sentinel).unwrap(), "preserved");
        let invalid = dir.path().join("registry-invalid.json");
        std::fs::write(&invalid, [0xc3, 0x28]).unwrap();
        assert!(receive(json!({"registryPath":"registry-invalid.json"}), dir.path()).is_err());
        assert!(!invalid.exists());
    }
}
