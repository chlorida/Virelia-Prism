use crate::services::metadata_cache::{self, TitleMetadataImageResult};
use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub fn read_title_metadata(app: AppHandle, cache_key: String) -> Result<Option<Value>, String> {
    metadata_cache::read_title_metadata(&app, &cache_key)
}

#[tauri::command]
pub fn write_title_metadata(app: AppHandle, record: Value) -> Result<(), String> {
    metadata_cache::write_title_metadata(&app, record)
}

#[tauri::command]
pub fn delete_title_metadata(app: AppHandle, cache_key: String) -> Result<(), String> {
    metadata_cache::delete_title_metadata(&app, &cache_key)
}

#[tauri::command]
pub fn cache_metadata_image(
    app: AppHandle,
    remote_url: String,
    kind: String,
) -> Result<TitleMetadataImageResult, String> {
    metadata_cache::cache_metadata_image(&app, &remote_url, &kind)
}
