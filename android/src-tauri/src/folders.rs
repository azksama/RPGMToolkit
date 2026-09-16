use crate::{engine, folder_snapshot};
use engine::Snapshot;
use serde_json::{json, Value};

pub struct FolderGame {
    pub token: String,
    pub path: String,
    pub title: String,
    pub snapshot: Option<Snapshot>,
    mod_hash: Option<String>,
    pub error: Option<String>,
    pub result: String,
}

impl FolderGame {
    pub fn from_scan(data: &Value) -> Result<Self, String> {
        let token = data["token"].as_str().filter(|s| !s.is_empty()).ok_or("Dossier non identifié.")?.to_owned();
        let checked = if let Some(error) = data["error"].as_str() { Err(error.to_owned()) } else { folder_snapshot(data) };
        let error = checked.as_ref().err().cloned();
        let mut game = Self {
            token, path: data["path"].as_str().unwrap_or("Dossier").into(),
            title: data["title"].as_str().unwrap_or("Jeu").into(),
            snapshot: None, mod_hash: None, error, result: String::new(),
        };
        if let Ok(snapshot) = checked { game.set_snapshot(snapshot); }
        Ok(game)
    }

    pub fn set_snapshot(&mut self, mut snapshot: Snapshot) {
        self.mod_hash = snapshot.previous_mod.take().map(|code| engine::hash(code.as_bytes()));
        self.snapshot = Some(snapshot);
    }

    pub fn plan(&self, code: &str) -> &'static str {
        if self.error.is_some() { return "blocked"; }
        let Some(snapshot) = &self.snapshot else { return "blocked"; };
        if snapshot.info.recovery_needed { return "recover"; }
        match snapshot.info.status.as_str() {
            "absent" => "install",
            "installed" if self.mod_hash.as_deref() == Some(engine::hash(code.as_bytes()).as_str()) => "current",
            "installed" => "update",
            _ => "repair",
        }
    }

    pub fn view(&self, code: &str) -> Value {
        json!({"token":self.token,"path":self.path,"title":self.title,"game":self.snapshot.as_ref().map(|s|&s.info),
            "plan":self.plan(code),"error":self.error,"result":self.result})
    }

    pub fn apply(&mut self, code: &str, uninstall: bool, mut native: impl FnMut(&str, Value) -> Result<Value, String>) {
        self.result.clear();
        let result = (|| {
            let expected = self.snapshot.as_ref().ok_or_else(|| self.error.clone().unwrap_or("Jeu incompatible.".into()))?.info.fingerprint.clone();
            let fresh = folder_snapshot(&native("inspectFolder", json!({"token":self.token}))?)?;
            let changed = fresh.info.fingerprint != expected;
            self.title = fresh.info.title.clone();
            self.set_snapshot(fresh);
            self.error = None;
            if changed { return Err("Fichiers modifiés depuis l’analyse. Vérifiez le nouvel état avant de relancer.".into()); }
            let plan = self.plan(code);
            if plan == "recover" { return Err("Restaurez d’abord l’opération interrompue.".into()); }
            let snapshot = self.snapshot.as_ref().unwrap();
            if (!uninstall && plan == "current") || (uninstall && snapshot.info.status == "absent") {
                self.result = if uninstall { "absent" } else { "current" }.into();
                return Ok(());
            }
            let patched = engine::patch_registry(&snapshot.registry, uninstall)?;
            let data = native("applyFolder", json!({"token":self.token,"registry":patched,"plugin":if uninstall {None}else{Some(code)},"expected":snapshot.info.fingerprint,"uninstall":uninstall}))?;
            let checked = folder_snapshot(&data)?;
            if checked.info.status != if uninstall { "absent" } else { "installed" } || (!uninstall && checked.previous_mod.as_deref() != Some(code)) {
                return Err("La vérification du mod installé a échoué.".into());
            }
            self.set_snapshot(checked);
            self.result = if uninstall { "removed" } else if plan == "install" { "installed" } else { "updated" }.into();
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            if let Ok(data) = native("inspectFolder", json!({"token":self.token})) {
                if let Ok(snapshot) = folder_snapshot(&data) { self.set_snapshot(snapshot); }
            }
            self.error = Some(error);
            self.result = "failed".into();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn data(registry: &str, plugin: Option<&str>) -> Value {
        json!({"token":"a","path":"Library/A/www","title":"A","engine":"MV","registry":registry,"plugin":plugin})
    }
    #[test]
    fn plans_distinguish_install_update_current_repair_and_blocked() {
        let empty = "var $plugins = [];";
        let installed = engine::patch_registry(empty, false).unwrap();
        assert_eq!(FolderGame::from_scan(&data(empty,None)).unwrap().plan("new"), "install");
        assert_eq!(FolderGame::from_scan(&data(&installed,Some("old"))).unwrap().plan("new"), "update");
        assert_eq!(FolderGame::from_scan(&data(&installed,Some("new"))).unwrap().plan("new"), "current");
        assert_eq!(FolderGame::from_scan(&data(&installed,None)).unwrap().plan("new"), "repair");
        assert_eq!(FolderGame::from_scan(&data("invalid",None)).unwrap().plan("new"), "blocked");
    }
    #[test]
    fn fresh_check_prevents_stale_writes_and_current_games_are_not_rewritten() {
        let empty = data("var $plugins = [];",None);
        let installed = data(&engine::patch_registry("var $plugins = [];",false).unwrap(),Some("new"));
        for original in [&empty,&installed] {
            let mut game = FolderGame::from_scan(original).unwrap();
            game.apply("new",false,|command,_| { assert_eq!(command,"inspectFolder"); Ok(installed.clone()) });
            assert_eq!(game.result,if original == &empty {"failed"}else{"current"});
        }
    }
    #[test]
    fn batch_failures_are_isolated_and_success_requires_matching_bytes() {
        let empty = data("var $plugins = [];",None);
        let mut games:Vec<_> = (0..3).map(|_|FolderGame::from_scan(&empty).unwrap()).collect();
        for (i,game) in games.iter_mut().enumerate() {
            game.apply("new",false,|command,args| {
                if command == "inspectFolder" { return Ok(empty.clone()); }
                assert_eq!(args["expected"],engine::fingerprint("var $plugins = [];",None));
                if i == 1 { return Err("Write denied".into()); }
                Ok(data(args["registry"].as_str().unwrap(),Some(if i == 2 {"wrong"} else {"new"})))
            });
        }
        assert_eq!(games.iter().map(|g|g.result.as_str()).collect::<Vec<_>>(),vec!["installed","failed","failed"]);
    }
}
