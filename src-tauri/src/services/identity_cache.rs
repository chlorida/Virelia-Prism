use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const IDENTITY_PARSER_VERSION: u32 = 4;

fn cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = dir.join("identity-cache");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

fn entry_file_name(media_id: &str, mtime_ms: u64, parser_version: u32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{media_id}|{mtime_ms}|{parser_version}").as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    format!("{hash}.json")
}

pub fn read_identity_cache(
    app: &AppHandle,
    media_id: &str,
    mtime_ms: u64,
    parser_version: u32,
) -> Result<Option<Value>, String> {
    if parser_version != IDENTITY_PARSER_VERSION {
        return Ok(None);
    }
    let root = cache_root(app)?;
    let path = root.join(entry_file_name(media_id, mtime_ms, parser_version));
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(Some(parsed))
}

pub fn write_identity_cache(
    app: &AppHandle,
    media_id: &str,
    mtime_ms: u64,
    parser_version: u32,
    parsed: Value,
) -> Result<(), String> {
    if parser_version != IDENTITY_PARSER_VERSION {
        return Ok(());
    }
    let root = cache_root(app)?;
    let path = root.join(entry_file_name(media_id, mtime_ms, parser_version));
    let serialized = serde_json::to_string(&parsed).map_err(|e| e.to_string())?;
    fs::write(path, serialized).map_err(|e| e.to_string())
}
