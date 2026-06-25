use crate::services::identity_cache;
use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub fn read_identity_cache(
    app: AppHandle,
    media_id: String,
    mtime_ms: u64,
    parser_version: u32,
) -> Result<Option<Value>, String> {
    identity_cache::read_identity_cache(&app, &media_id, mtime_ms, parser_version)
}

#[tauri::command]
pub fn write_identity_cache(
    app: AppHandle,
    media_id: String,
    mtime_ms: u64,
    parser_version: u32,
    parsed: Value,
) -> Result<(), String> {
    identity_cache::write_identity_cache(&app, &media_id, mtime_ms, parser_version, parsed)
}
