use crate::services::thumbnail_service::{self, ThumbnailRecord};
use tauri::AppHandle;

#[tauri::command]
pub fn get_thumbnail(
    app: AppHandle,
    media_id: String,
    file_path: String,
    file_name: Option<String>,
    priority: Option<i32>,
) -> Result<ThumbnailRecord, String> {
    let name = file_name.unwrap_or_else(|| {
        std::path::Path::new(&file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string()
    });
    thumbnail_service::get_thumbnail(&app, media_id, file_path, name, priority.unwrap_or(0))
}

#[tauri::command]
pub fn retry_thumbnail(
    app: AppHandle,
    media_id: String,
    file_path: String,
    file_name: Option<String>,
) -> Result<ThumbnailRecord, String> {
    let name = file_name.unwrap_or_else(|| {
        std::path::Path::new(&file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string()
    });
    thumbnail_service::retry_thumbnail(&app, media_id, file_path, name)
}
