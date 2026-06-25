use crate::models::{LibraryChangedPayload, MediaItem, ScanResult};
use crate::services::media_file_filter::should_include_cached_media_item;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

/// In-memory library cache backed by disk snapshots.
pub struct LibraryStore {
    inner: Mutex<LibraryState>,
}

struct LibraryState {
    items_by_id: HashMap<String, MediaItem>,
    indexed_folders: HashSet<String>,
    last_scan_at: Option<String>,
}

impl Default for LibraryStore {
    fn default() -> Self {
        Self {
            inner: Mutex::new(LibraryState {
                items_by_id: HashMap::new(),
                indexed_folders: HashSet::new(),
                last_scan_at: None,
            }),
        }
    }
}

impl LibraryStore {
    /// Warm-start: load persisted snapshot into memory without scanning.
    pub fn hydrate_from_cache(
        &self,
        folders: &[String],
        media: Vec<MediaItem>,
        scanned_at: String,
    ) -> bool {
        if media.is_empty() {
            return false;
        }
        let mut state = self.inner.lock().expect("library store poisoned");
        state.items_by_id.clear();
        state.indexed_folders.clear();
        for folder in folders {
            state.indexed_folders.insert(normalize_folder_key(folder));
        }
        for item in media {
            if should_include_cached_media_item(&item.file_path, &item.file_name) {
                state.items_by_id.insert(item.id.clone(), item);
            }
        }
        state.last_scan_at = Some(scanned_at);
        true
    }

    pub fn merge_import(&self, folders: &[String], items: Vec<MediaItem>) -> LibraryChangedPayload {
        let mut state = self.inner.lock().expect("library store poisoned");
        for folder in folders {
            state.indexed_folders.insert(normalize_folder_key(folder));
        }
        for item in items {
            if should_include_cached_media_item(&item.file_path, &item.file_name) {
                state.items_by_id.insert(item.id.clone(), item);
            }
        }
        state.last_scan_at = Some(chrono::Utc::now().to_rfc3339());
        Self::snapshot_locked(&state)
    }

    pub fn merge_scan(&self, folder: &str, scan: ScanResult) -> LibraryChangedPayload {
        let mut state = self.inner.lock().expect("library store poisoned");
        state.indexed_folders.insert(normalize_folder_key(folder));

        for item in scan.items {
            if should_include_cached_media_item(&item.file_path, &item.file_name) {
                state.items_by_id.insert(item.id.clone(), item);
            }
        }

        state.last_scan_at = Some(chrono::Utc::now().to_rfc3339());
        Self::snapshot_locked(&state)
    }

    pub fn get_all_items(&self) -> Vec<MediaItem> {
        let state = self.inner.lock().expect("library store poisoned");
        let mut items: Vec<MediaItem> = state.items_by_id.values().cloned().collect();
        items.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        items
    }

    pub fn remove_folder(&self, folder: &str) -> LibraryChangedPayload {
        let mut state = self.inner.lock().expect("library store poisoned");
        let key = normalize_folder_key(folder);
        state.indexed_folders.remove(&key);

        let folder_path =
            std::fs::canonicalize(folder).unwrap_or_else(|_| std::path::PathBuf::from(folder));
        state.items_by_id.retain(|_, item| {
            let item_path = std::path::Path::new(&item.file_path);
            let Ok(canonical) = std::fs::canonicalize(item_path) else {
                return true;
            };
            !canonical.starts_with(&folder_path)
        });

        state.last_scan_at = Some(chrono::Utc::now().to_rfc3339());
        Self::snapshot_locked(&state)
    }

    pub fn indexed_folders(&self) -> Vec<String> {
        let state = self.inner.lock().expect("library store poisoned");
        let mut folders: Vec<String> = state.indexed_folders.iter().cloned().collect();
        folders.sort();
        folders
    }

    pub fn snapshot_payload(&self) -> LibraryChangedPayload {
        let state = self.inner.lock().expect("library store poisoned");
        Self::snapshot_locked(&state)
    }

    fn snapshot_locked(state: &LibraryState) -> LibraryChangedPayload {
        let mut media: Vec<MediaItem> = state.items_by_id.values().cloned().collect();
        media.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        let mut folders: Vec<String> = state.indexed_folders.iter().cloned().collect();
        folders.sort();
        LibraryChangedPayload {
            folders,
            media,
            scanned_at: state
                .last_scan_at
                .clone()
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        }
    }
}

fn normalize_folder_key(folder: &str) -> String {
    let path = std::path::Path::new(folder);
    crate::services::scanner::normalize_path_key(path)
}
