use crate::models::{
    LibraryChangedPayload, ScanProgress, ScanResult, ValidationResult, WatchFoldersResult,
};
use crate::settings;

use crate::services::scanner::{self, ProgressCallback};

use crate::state::library_disk_cache::{self, LibraryCachePaths};

use crate::state::{LibraryStore, SubtitleIndexStore};

use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Emitter, State};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]

pub struct LoadCachedLibraryResult {
    pub folders: Vec<String>,

    pub media: Vec<crate::models::MediaItem>,

    pub scanned_at: String,

    pub counts: library_disk_cache::LibrarySnapshotCounts,

    pub source: String,
}

#[tauri::command]

pub async fn scan_folder(
    app: AppHandle,

    store: State<'_, LibraryStore>,

    path: String,
) -> Result<ScanResult, String> {
    scanner::validate_scan_root(&path)?;

    let app_handle = app.clone();

    let folder = path.clone();

    let cached_items = store.get_all_items();

    let scan = tauri::async_runtime::spawn_blocking(move || {
        let scan_started = Instant::now();
        eprintln!(
            "[Virelia scan] start folder={folder} cached={}",
            cached_items.len()
        );

        let progress: Option<ProgressCallback> = Some(Arc::new(move |payload: ScanProgress| {
            if payload.done || payload.scanned % 5000 == 0 {
                eprintln!(
                    "[Virelia scan] progress scanned={} added={} skipped={} done={}",
                    payload.scanned, payload.added, payload.skipped, payload.done
                );
            }
            let _ = app_handle.emit("scan-progress", payload);
        }));

        let result = scanner::scan_folder(&folder, progress, &cached_items);
        eprintln!(
            "[Virelia scan] done ms={} items={} added={} skipped={} errors={}",
            scan_started.elapsed().as_millis(),
            result.items.len(),
            result.added,
            result.skipped,
            result.errors.len()
        );
        result
    })
    .await
    .map_err(|e| e.to_string())?;

    if !scan.subtitle_index.is_empty() {
        SubtitleIndexStore::merge_entries(&app, scan.subtitle_index.clone());
        let _ = SubtitleIndexStore::save_to_disk(&app);
    }

    let library_payload = store.merge_scan(&path, scan.clone());

    let _ = app.emit("library-changed", library_payload);

    Ok(scan)
}

#[tauri::command]

pub async fn load_library_cached(
    app: AppHandle,

    store: State<'_, LibraryStore>,

    folders: Vec<String>,
) -> Result<Option<LoadCachedLibraryResult>, String> {
    let app_handle = app.clone();

    let store_items = store.get_all_items();

    let disk = tauri::async_runtime::spawn_blocking(move || {
        library_disk_cache::load_library_disk_cache(&app_handle, &folders)
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Some(snapshot) = disk {
        store.hydrate_from_cache(
            &snapshot.folders,
            snapshot.media.clone(),
            snapshot.scanned_at.clone(),
        );

        return Ok(Some(LoadCachedLibraryResult {
            folders: snapshot.folders,

            media: snapshot.media,

            scanned_at: snapshot.scanned_at,

            counts: snapshot.counts,

            source: "disk".to_string(),
        }));
    }

    if !store_items.is_empty() {
        let payload = store.snapshot_payload();

        let counts = library_disk_cache::LibrarySnapshotCounts {
            all: payload.media.len(),

            audio: payload
                .media
                .iter()
                .filter(|m| m.kind == crate::models::MediaKind::Audio)
                .count(),

            video: payload
                .media
                .iter()
                .filter(|m| m.kind == crate::models::MediaKind::Video)
                .count(),
        };

        return Ok(Some(LoadCachedLibraryResult {
            folders: payload.folders,

            media: payload.media,

            scanned_at: payload.scanned_at,

            counts,

            source: "memory".to_string(),
        }));
    }

    Ok(None)
}

#[tauri::command]

pub fn get_library(
    store: State<'_, LibraryStore>,
) -> Result<Vec<crate::models::MediaItem>, String> {
    Ok(store.get_all_items())
}

#[tauri::command]

pub fn get_library_boot_paths(app: AppHandle) -> Result<LibraryCachePaths, String> {
    library_disk_cache::library_cache_paths(&app)
}

#[tauri::command]

pub fn save_library_snapshot(app: AppHandle, store: State<'_, LibraryStore>) -> Result<(), String> {
    let payload = store.snapshot_payload();

    library_disk_cache::save_library_disk_cache(
        &app,
        &payload.folders,
        &payload.media,
        &payload.scanned_at,
        true,
    )
}

#[tauri::command]

pub fn clear_library_snapshot(app: AppHandle) -> Result<(), String> {
    library_disk_cache::clear_library_disk_cache(&app)
}

#[tauri::command]

pub fn validate_media_path(path: String) -> Result<ValidationResult, String> {
    Ok(scanner::validate_media_path(&path))
}

#[tauri::command]

pub async fn import_media_paths(
    app: AppHandle,

    store: State<'_, LibraryStore>,

    paths: Vec<String>,
) -> Result<LibraryChangedPayload, String> {
    let cached_items = store.get_all_items();

    let scan = tauri::async_runtime::spawn_blocking(move || {
        scanner::import_media_paths(&paths, &cached_items)
    })
    .await
    .map_err(|e| e.to_string())?;

    if scan.items.is_empty() {
        if let Some(err) = scan.errors.first() {
            return Err(err.clone());
        }

        return Ok(LibraryChangedPayload {
            folders: store.indexed_folders(),

            media: Vec::new(),

            scanned_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    let parent_folders: Vec<String> = scan
        .items
        .iter()
        .map(|item| item.folder.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let settings_value = settings::load(&app)?;

    let existing_folders: Vec<String> = settings_value
        .get("libraryFolders")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    let merged_folders: Vec<String> = existing_folders
        .into_iter()
        .chain(parent_folders.iter().cloned())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    settings::save(
        &app,
        serde_json::json!({ "libraryFolders": merged_folders }),
    )?;

    let payload = store.merge_import(&merged_folders, scan.items.clone());

    if !payload.media.is_empty() {
        let _ = library_disk_cache::save_library_disk_cache(
            &app,
            &payload.folders,
            &payload.media,
            &payload.scanned_at,
            true,
        );
    }

    let import_payload = LibraryChangedPayload {
        folders: payload.folders,
        media: scan.items,
        scanned_at: payload.scanned_at,
    };

    let _ = app.emit("library-changed", import_payload.clone());
    Ok(import_payload)
}

#[tauri::command]

pub fn remove_folder(
    app: AppHandle,

    store: State<'_, LibraryStore>,

    path: String,
) -> Result<(), String> {
    let payload = store.remove_folder(&path);

    if !payload.media.is_empty() {
        let _ = library_disk_cache::save_library_disk_cache(
            &app,
            &payload.folders,
            &payload.media,
            &payload.scanned_at,
            true,
        );
    }

    let _ = app.emit("library-changed", payload);

    Ok(())
}

/// File watching is not implemented yet.

#[tauri::command]

pub fn watch_folders(_paths: Vec<String>) -> Result<WatchFoldersResult, String> {
    Ok(WatchFoldersResult {
        enabled: false,

        message: "File watching is not implemented in the Tauri shell yet."
            .to_string(),
    })
}
