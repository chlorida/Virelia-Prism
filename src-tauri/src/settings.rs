use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const SETTINGS_FILE: &str = "settings.json";

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(SETTINGS_FILE))
}

fn default_settings() -> Value {
    serde_json::from_str(include_str!("../default_settings.json"))
        .expect("default_settings.json must be valid")
}

const CURRENT_SETTINGS_SCHEMA_VERSION: u64 = 3;

fn migrate_settings(settings: &mut Value) {
    let version = settings
        .get("settingsSchemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(1);

    if version >= CURRENT_SETTINGS_SCHEMA_VERSION {
        return;
    }

    if let Some(meta) = settings.get_mut("metadata").and_then(|v| v.as_object_mut()) {
        meta.entry("enableOnlineLookup")
            .or_insert(Value::Bool(true));
        meta.entry("metadataRefreshOnTitleOpen")
            .or_insert(Value::Bool(true));
        meta.entry("metadataCardsSimpleMode")
            .or_insert(Value::Bool(true));
    }

    if let Some(disc) = settings
        .get_mut("discovery")
        .and_then(|v| v.as_object_mut())
    {
        let online_disabled = disc
            .get("disableOnlineDiscovery")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        disc.entry("disableOnlineDiscovery")
            .or_insert(Value::Bool(false));
        disc.entry("enableOnlineCatalog")
            .or_insert(Value::Bool(!online_disabled));
        disc.entry("enableCatalogSearch")
            .or_insert(Value::Bool(true));
        disc.entry("enableDiscoverCatalogRails")
            .or_insert(Value::Bool(true));
        disc.entry("enableReviews").or_insert(Value::Bool(true));
        disc.entry("enableRecommendations")
            .or_insert(Value::Bool(true));
    }

    if let Some(sub) = settings
        .get_mut("subtitles")
        .and_then(|v| v.as_object_mut())
    {
        sub.insert("autoLoad".into(), Value::Bool(true));
        sub.insert("autoGenerate".into(), Value::Bool(true));
        sub.insert("progressiveSubtitleGeneration".into(), Value::Bool(true));
        sub.insert("usePartialGeneratedSubtitles".into(), Value::Bool(true));
        sub.insert("subtitleTimelineCoverage".into(), Value::Bool(true));
    }

    if let Some(vis) = settings
        .get_mut("visualizer")
        .and_then(|v| v.as_object_mut())
    {
        vis.insert("enabled".into(), Value::Bool(true));
    }

    if let Some(root) = settings.as_object_mut() {
        root.entry("onboarding").or_insert(serde_json::json!({
            "welcomeCompleted": false
        }));
    }

    if let Some(root) = settings.as_object_mut() {
        root.insert(
            "settingsSchemaVersion".into(),
            Value::Number(CURRENT_SETTINGS_SCHEMA_VERSION.into()),
        );
    }
}

fn deep_merge(base: &mut Value, patch: Value) {
    match (base, patch) {
        (Value::Object(base_map), Value::Object(patch_map)) => {
            for (key, patch_value) in patch_map {
                match base_map.get_mut(&key) {
                    Some(base_value) => deep_merge(base_value, patch_value),
                    None => {
                        base_map.insert(key, patch_value);
                    }
                }
            }
        }
        (base_slot, patch_value) => *base_slot = patch_value,
    }
}

/// Merge persisted settings over defaults (same strategy as Electron SettingsStore).
pub fn load(app: &AppHandle) -> Result<Value, String> {
    let path = settings_path(app)?;
    let mut settings = default_settings();

    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let stored: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        deep_merge(&mut settings, stored);
    }

    migrate_settings(&mut settings);

    Ok(settings)
}

pub fn save(app: &AppHandle, patch: Value) -> Result<Value, String> {
    let path = settings_path(app)?;
    let mut current = load(app)?;
    deep_merge(&mut current, patch);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    fs::write(&path, serialized).map_err(|e| e.to_string())?;

    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::{deep_merge, migrate_settings};
    use serde_json::json;

    #[test]
    fn deep_merge_nested_playback() {
        let mut base = json!({ "playback": { "volume": 0.5, "speed": 1 } });
        deep_merge(&mut base, json!({ "playback": { "volume": 0.8 } }));
        assert_eq!(base["playback"]["volume"], 0.8);
        assert_eq!(base["playback"]["speed"], 1);
    }

    #[test]
    fn migrate_preserves_explicit_online_preferences() {
        let mut settings = json!({
            "settingsSchemaVersion": 1,
            "metadata": { "enableOnlineLookup": false },
            "discovery": { "disableOnlineDiscovery": true, "enableOnlineCatalog": false },
            "uiSounds": { "enabled": true }
        });
        migrate_settings(&mut settings);
        assert_eq!(settings["settingsSchemaVersion"], 3);
        assert_eq!(settings["metadata"]["enableOnlineLookup"], false);
        assert_eq!(settings["discovery"]["disableOnlineDiscovery"], true);
        assert_eq!(settings["discovery"]["enableOnlineCatalog"], false);
        assert_eq!(settings["uiSounds"]["enabled"], true);
    }
}
