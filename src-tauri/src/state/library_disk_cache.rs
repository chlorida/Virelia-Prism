use crate::models::MediaItem;
use crate::services::scanner::normalize_path_key;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

pub const SNAPSHOT_VERSION: u32 = 4;
pub const MEDIA_INDEX_VERSION: u32 = 3;
const SNAPSHOT_FILE: &str = "library.snapshot.json";
const SNAPSHOT_TMP: &str = "library.snapshot.json.tmp";
const BACKUP_FILE: &str = "library.snapshot.backup.json";
const LEGACY_FILE: &str = "library-index-cache.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotCounts {
    pub all: usize,
    pub audio: usize,
    pub video: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCacheSnapshot {
    pub folders: Vec<String>,
    pub media: Vec<MediaItem>,
    pub scanned_at: String,
    pub counts: LibrarySnapshotCounts,
    pub completed_scan: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskLibrarySnapshot {
    version: u32,
    created_at: String,
    completed_scan: bool,
    item_count: usize,
    folder_count: usize,
    folders: Vec<String>,
    media: Vec<MediaItem>,
    scanned_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    counts: Option<LibrarySnapshotCounts>,
    #[serde(skip_serializing_if = "Option::is_none")]
    media_index_version: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCachePaths {
    pub app_data_dir: String,
    pub snapshot_file: String,
    pub snapshot_backup_file: String,
    pub legacy_cache_file: String,
}

pub fn library_cache_paths(app: &AppHandle) -> Result<LibraryCachePaths, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(LibraryCachePaths {
        app_data_dir: dir.to_string_lossy().to_string(),
        snapshot_file: dir.join(SNAPSHOT_FILE).to_string_lossy().to_string(),
        snapshot_backup_file: dir.join(BACKUP_FILE).to_string_lossy().to_string(),
        legacy_cache_file: dir.join(LEGACY_FILE).to_string_lossy().to_string(),
    })
}

fn snapshot_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(SNAPSHOT_FILE))
}

fn backup_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(BACKUP_FILE))
}

fn legacy_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(LEGACY_FILE))
}

pub fn normalize_folder_list(folders: &[String]) -> Vec<String> {
    let mut out: Vec<String> = folders.iter().map(|f| normalize_folder_key(f)).collect();
    out.sort();
    out.dedup();
    out
}

pub fn normalize_folder_key(folder: &str) -> String {
    let mut key = normalize_path_key(Path::new(folder));
    while key.len() > 3 && key.ends_with('\\') {
        key.pop();
    }
    key
}

fn folders_key(folders: &[String]) -> String {
    let normalized = normalize_folder_list(folders);
    normalized.join("|")
}

fn compute_counts(media: &[MediaItem]) -> LibrarySnapshotCounts {
    let mut audio = 0usize;
    let mut video = 0usize;
    for item in media {
        match item.kind {
            crate::models::MediaKind::Audio => audio += 1,
            crate::models::MediaKind::Video => video += 1,
        }
    }
    LibrarySnapshotCounts {
        all: media.len(),
        audio,
        video,
    }
}

fn parse_snapshot_file(
    raw: &str,
    expected_folders: &[String],
) -> Result<Option<LibraryCacheSnapshot>, String> {
    let parsed: DiskLibrarySnapshot = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if parsed.version != SNAPSHOT_VERSION
        && parsed.version != 3
        && parsed.version != 2
        && parsed.version != 1
    {
        return Ok(None);
    }
    let media_index_version = parsed.media_index_version.unwrap_or(0);
    if media_index_version < MEDIA_INDEX_VERSION {
        return Ok(None);
    }
    if folders_key(&parsed.folders) != folders_key(expected_folders) {
        return Ok(None);
    }
    if parsed.media.is_empty() {
        return Ok(None);
    }
    let completed = parsed.completed_scan || parsed.version < SNAPSHOT_VERSION;
    if !completed {
        return Ok(None);
    }
    let media = crate::services::scanner::sanitize_media_items(parsed.media);
    if media.is_empty() {
        return Ok(None);
    }
    let counts = parsed.counts.unwrap_or_else(|| compute_counts(&media));
    Ok(Some(LibraryCacheSnapshot {
        folders: parsed.folders,
        media,
        scanned_at: parsed.scanned_at,
        counts,
        completed_scan: true,
    }))
}

fn read_snapshot_at(
    path: &Path,
    expected_folders: &[String],
) -> Result<Option<LibraryCacheSnapshot>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    parse_snapshot_file(&raw, expected_folders)
}

pub fn load_library_disk_cache(
    app: &AppHandle,
    expected_folders: &[String],
) -> Result<Option<LibraryCacheSnapshot>, String> {
    if expected_folders.is_empty() {
        return Ok(None);
    }

    let primary = snapshot_path(app)?;
    if let Some(snapshot) = read_snapshot_at(&primary, expected_folders)? {
        return Ok(Some(snapshot));
    }

    let backup = backup_path(app)?;
    if let Some(snapshot) = read_snapshot_at(&backup, expected_folders)? {
        // Restore primary from good backup
        let _ = atomic_write_snapshot(app, &snapshot, true);
        return Ok(Some(snapshot));
    }

    let legacy = legacy_path(app)?;
    if legacy.exists() {
        let raw = fs::read_to_string(&legacy).map_err(|e| e.to_string())?;
        if let Some(snapshot) = parse_snapshot_file(&raw, expected_folders)? {
            let _ = atomic_write_snapshot(app, &snapshot, true);
            return Ok(Some(snapshot));
        }
    }

    Ok(None)
}

fn atomic_write_snapshot(
    app: &AppHandle,
    snapshot: &LibraryCacheSnapshot,
    rotate_backup: bool,
) -> Result<(), String> {
    if snapshot.media.is_empty() {
        return Err("refusing to write empty library snapshot".to_string());
    }
    if !snapshot.completed_scan {
        return Err("refusing to write incomplete library snapshot".to_string());
    }

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let primary = dir.join(SNAPSHOT_FILE);
    let tmp = dir.join(SNAPSHOT_TMP);
    let backup = dir.join(BACKUP_FILE);

    if rotate_backup && primary.exists() {
        let _ = fs::copy(&primary, &backup);
    }

    let counts = snapshot.counts.clone();
    let payload = DiskLibrarySnapshot {
        version: SNAPSHOT_VERSION,
        created_at: chrono::Utc::now().to_rfc3339(),
        completed_scan: true,
        item_count: snapshot.media.len(),
        folder_count: snapshot.folders.len(),
        folders: snapshot.folders.clone(),
        media: snapshot.media.clone(),
        scanned_at: snapshot.scanned_at.clone(),
        counts: Some(counts),
        media_index_version: Some(MEDIA_INDEX_VERSION),
    };

    let serialized = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        file.write_all(serialized.as_bytes())
            .map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())?;
    }
    if primary.exists() {
        let _ = fs::remove_file(&primary);
    }
    fs::rename(&tmp, &primary).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_library_disk_cache(
    app: &AppHandle,
    folders: &[String],
    media: &[MediaItem],
    scanned_at: &str,
    completed_scan: bool,
) -> Result<(), String> {
    if media.is_empty() {
        return Err("refusing to save empty library snapshot".to_string());
    }
    if !completed_scan {
        return Err("refusing to save incomplete library snapshot".to_string());
    }
    let counts = compute_counts(media);
    let snapshot = LibraryCacheSnapshot {
        folders: folders.to_vec(),
        media: media.to_vec(),
        scanned_at: scanned_at.to_string(),
        counts,
        completed_scan: true,
    };
    atomic_write_snapshot(app, &snapshot, true)
}

pub fn clear_library_disk_cache(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    for name in [SNAPSHOT_FILE, SNAPSHOT_TMP, BACKUP_FILE, LEGACY_FILE] {
        let path = dir.join(name);
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folders_key_ignores_case_and_slashes() {
        let a = folders_key(&["D:\\Media".to_string()]);
        let b = folders_key(&["d:/media/".to_string()]);
        assert_eq!(a, b);
    }
}
