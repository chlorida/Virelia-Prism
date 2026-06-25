use crate::settings;
use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Value, String> {
    settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, patch: Value) -> Result<Value, String> {
    settings::save(&app, patch)
}
