use crate::models::{ExternalSubtitleIndexEntry, SubtitleLibraryIndex};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

const INDEX_FILE: &str = "subtitle.index.json";

pub struct SubtitleIndexStore {
    inner: Mutex<SubtitleLibraryIndex>,
}

impl Default for SubtitleIndexStore {
    fn default() -> Self {
        Self {
            inner: Mutex::new(SubtitleLibraryIndex::default()),
        }
    }
}

impl SubtitleIndexStore {
    pub fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
        Ok(app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join(INDEX_FILE))
    }

    pub fn load_from_disk(app: &AppHandle) -> Result<(), String> {
        let path = Self::index_path(app)?;
        if !path.exists() {
            return Ok(());
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let index: SubtitleLibraryIndex = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let store = app.state::<SubtitleIndexStore>();
        if let Ok(mut guard) = store.inner.lock() {
            *guard = index;
        }
        Ok(())
    }

    pub fn save_to_disk(app: &AppHandle) -> Result<(), String> {
        let path = Self::index_path(app)?;
        let store = app.state::<SubtitleIndexStore>();
        let guard = store.inner.lock().map_err(|e| e.to_string())?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(&*guard).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    pub fn merge_entries(
        app: &AppHandle,
        entries: std::collections::HashMap<String, Vec<ExternalSubtitleIndexEntry>>,
    ) {
        let store = app.state::<SubtitleIndexStore>();
        let mut guard = match store.inner.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        for (video_id, list) in entries {
            let slot = guard.by_video_id.entry(video_id).or_default();
            for entry in list {
                if !slot.iter().any(|e| e.path == entry.path) {
                    slot.push(entry);
                }
            }
        }
    }

    pub fn get_for_video(app: &AppHandle, video_id: &str) -> Vec<ExternalSubtitleIndexEntry> {
        let store = app.state::<SubtitleIndexStore>();
        let guard = match store.inner.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        guard.by_video_id.get(video_id).cloned().unwrap_or_default()
    }
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}
