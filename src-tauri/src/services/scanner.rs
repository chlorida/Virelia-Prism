use crate::models::{MediaItem, MediaKind, ScanProgress, ScanResult, SkippedMediaEntry};

use crate::models::ExternalSubtitleIndexEntry;

use crate::services::media_file_filter::{
    detect_media_kind_from_extension, get_extension_info, probe_confirms_media_kind,
    should_skip_media_file, SkipReason,
};

use crate::services::subtitle_discovery::is_subtitle_extension;

use sha1::{Digest, Sha1};

use std::collections::HashMap;

use std::fs;

use std::path::{Path, PathBuf};

use std::sync::atomic::{AtomicU64, Ordering};

use std::sync::{Arc, Mutex};

use std::time::{Duration, Instant};

use walkdir::WalkDir;

fn normalize_extension(extension: &str) -> String {
    let trimmed = extension.trim().to_lowercase();

    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.starts_with('.') {
        trimmed
    } else {
        format!(".{trimmed}")
    }
}

/// Stable id: SHA1 hex of normalized absolute path (matches Electron `createMediaId`).

pub fn media_id_for_path(file_path: &Path) -> String {
    let normalized = normalize_path_key(file_path);

    let mut hasher = Sha1::new();

    hasher.update(normalized.as_bytes());

    format!("{:x}", hasher.finalize())
}

pub fn normalize_path_key(path: &Path) -> String {
    let absolute = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());

    absolute.to_string_lossy().replace('/', "\\").to_lowercase()
}

fn title_from_file_name(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);

    stem.replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_folder_label(folder: &str) -> String {
    let normalized = folder.replace('\\', "/");

    let parts: Vec<&str> = normalized.split('/').filter(|p| !p.is_empty()).collect();

    if parts.len() <= 2 {
        return folder.to_string();
    }

    format!("…/{}/{}", parts[parts.len() - 2], parts[parts.len() - 1])
}

fn build_search_text(item: &MediaItem) -> String {
    [
        item.file_name.as_str(),
        item.title.as_str(),
        item.folder.as_str(),
        item.extension.as_str(),
    ]
    .join(" ")
    .to_lowercase()
}

fn media_item_from_path(file_path: PathBuf) -> Result<MediaItem, String> {
    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    if let Some(reason) = should_skip_media_file(&file_path) {
        return Err(reason.as_str().to_string());
    }

    let extension_info = get_extension_info(&file_name);

    let ext_norm = normalize_extension(&extension_info.compound_extension);

    let kind = detect_media_kind_from_extension(&extension_info)
        .ok_or_else(|| "unsupported extension".to_string())?;

    let metadata = fs::metadata(&file_path).map_err(|e| e.to_string())?;

    if !metadata.is_file() {
        return Err("not a file".to_string());
    }

    let folder = file_path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let title = title_from_file_name(&file_name);

    let modified_at = metadata
        .modified()
        .or_else(|_| metadata.created())
        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
        .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());

    let mtime_ms = metadata
        .modified()
        .or_else(|_| metadata.created())
        .ok()
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_millis() as u64)
        });

    let mut item = MediaItem {
        id: media_id_for_path(&file_path),

        file_path: file_path.to_string_lossy().to_string(),

        file_name,

        title,

        folder: folder.clone(),

        extension: ext_norm,

        kind,

        size: metadata.len(),

        mtime_ms,

        modified_at,

        duration_seconds: None,

        search_text: None,

        folder_label: Some(build_folder_label(&folder)),

        tags: Vec::new(),

        favorite: false,
    };

    item.search_text = Some(build_search_text(&item));

    Ok(item)
}

pub type ProgressCallback = Arc<dyn Fn(ScanProgress) + Send + Sync>;

pub fn validate_scan_root(folder_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(folder_path);

    if !path.exists() {
        return Err(format!("folder not found: {folder_path}"));
    }

    let metadata =
        fs::metadata(path).map_err(|e| format!("permission denied or inaccessible: {e}"))?;

    if !metadata.is_dir() {
        return Err(format!("path is not a folder: {folder_path}"));
    }

    fs::canonicalize(path).map_err(|e| format!("cannot resolve folder path: {e}"))
}

fn cached_item_still_valid(path: &Path, cached: &MediaItem) -> bool {
    if !crate::services::media_file_filter::should_include_cached_media_item(
        &cached.file_path,
        &cached.file_name,
    ) {
        return false;
    }

    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };

    if metadata.len() != cached.size {
        return false;
    }

    let Some(cached_mtime) = cached.mtime_ms else {
        return false;
    };

    let disk_mtime = metadata
        .modified()
        .or_else(|_| metadata.created())
        .ok()
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_millis() as u64)
        });

    disk_mtime == Some(cached_mtime)
}

const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(300);

const MAX_SKIPPED_DIAGNOSTICS: usize = 200;

pub fn scan_folder(
    folder_path: &str,

    on_progress: Option<ProgressCallback>,

    cached_items: &[MediaItem],
) -> ScanResult {
    let root = match validate_scan_root(folder_path) {
        Ok(path) => path,

        Err(message) => {
            return ScanResult {
                items: Vec::new(),

                added: 0,

                skipped: 0,

                errors: vec![message],

                subtitle_index: HashMap::new(),

                skipped_items: Vec::new(),
            };
        }
    };

    let mut items = Vec::new();

    let mut errors = Vec::new();

    let mut skipped_items: Vec<SkippedMediaEntry> = Vec::new();

    let scanned = AtomicU64::new(0);

    let added = AtomicU64::new(0);

    let skipped = AtomicU64::new(0);

    let reused = AtomicU64::new(0);

    let last_emit = Mutex::new(Instant::now());

    let cache_by_path: HashMap<String, MediaItem> = cached_items
        .iter()
        .filter(|item| {
            crate::services::media_file_filter::should_include_cached_media_item(
                &item.file_path,
                &item.file_name,
            )
        })
        .map(|item| (normalize_path_key(Path::new(&item.file_path)), item.clone()))
        .collect();

    let mut record_skip = |path: &Path, reason: SkipReason| {
        skipped.fetch_add(1, Ordering::Relaxed);

        if skipped_items.len() < MAX_SKIPPED_DIAGNOSTICS {
            skipped_items.push(SkippedMediaEntry {
                path: path.to_string_lossy().to_string(),

                reason: reason.as_str().to_string(),
            });
        }
    };

    let emit = |current_path: &str, done: bool| {
        if on_progress.is_none() {
            return;
        }

        if !done {
            let mut last = last_emit.lock().expect("progress lock");

            if last.elapsed() < PROGRESS_EMIT_INTERVAL {
                return;
            }

            *last = Instant::now();
        }

        if let Some(ref cb) = on_progress {
            cb(ScanProgress {
                current_path: current_path.to_string(),

                scanned: scanned.load(Ordering::Relaxed),

                added: added.load(Ordering::Relaxed),

                skipped: skipped.load(Ordering::Relaxed),

                total: None,

                done,
            });
        }
    };

    emit(folder_path, false);

    let walker = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if entry.file_type().is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();

                if name.contains("$recycle.bin") {
                    return false;
                }

                if name == "node_modules" || name == "target" || name == ".git" {
                    return false;
                }
            }

            true
        });

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,

            Err(err) => {
                skipped.fetch_add(1, Ordering::Relaxed);

                errors.push(err.to_string());

                continue;
            }
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path().to_path_buf();

        scanned.fetch_add(1, Ordering::Relaxed);

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

        if is_subtitle_extension(extension) {
            record_skip(&path, SkipReason::UnsupportedExtension);

            continue;
        }

        if let Some(reason) = should_skip_media_file(&path) {
            record_skip(&path, reason);

            continue;
        }

        let extension_info = get_extension_info(file_name);

        let ext_norm = normalize_extension(&extension_info.compound_extension);

        if ext_norm == ".ts" || ext_norm == ".dts" {
            if let Ok(crate::services::ffmpeg_util::FfmpegPaths { ffprobe, .. }) =
                crate::services::ffmpeg_util::locate_ffmpeg(None)
            {
                let expected = if ext_norm == ".ts" {
                    MediaKind::Video
                } else {
                    MediaKind::Audio
                };

                if !probe_confirms_media_kind(&ffprobe, &path, expected) {
                    record_skip(&path, SkipReason::AmbiguousExtension);

                    continue;
                }
            } else {
                record_skip(&path, SkipReason::AmbiguousExtension);

                continue;
            }
        }

        let path_key = normalize_path_key(&path);

        if let Some(cached) = cache_by_path.get(&path_key) {
            if cached_item_still_valid(&path, cached) {
                reused.fetch_add(1, Ordering::Relaxed);

                added.fetch_add(1, Ordering::Relaxed);

                items.push(cached.clone());

                emit(&path.to_string_lossy(), false);

                continue;
            }
        }

        match media_item_from_path(path.clone()) {
            Ok(item) => {
                added.fetch_add(1, Ordering::Relaxed);

                items.push(item);

                emit(&path.to_string_lossy(), false);
            }

            Err(message) => {
                record_skip(&path, SkipReason::UnsupportedExtension);

                errors.push(format!("{}: {message}", path.display()));
            }
        }
    }

    items.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

    emit(folder_path, true);

    let subtitle_index = build_subtitle_index_for_videos(&items);

    ScanResult {
        added: added.load(Ordering::Relaxed) as usize,

        skipped: skipped.load(Ordering::Relaxed) as usize,

        items,

        errors,

        subtitle_index,

        skipped_items,
    }
}

fn build_subtitle_index_for_videos(
    items: &[MediaItem],
) -> HashMap<String, Vec<ExternalSubtitleIndexEntry>> {
    let mut index = HashMap::new();

    for item in items {
        if item.kind != MediaKind::Video {
            continue;
        }

        let matched = crate::services::subtitle_discovery::discover_external_subtitles_in_dir(
            Path::new(&item.file_path),
        );

        if !matched.is_empty() {
            index.insert(item.id.clone(), matched);
        }
    }

    index
}

/// Import explicit media file paths (drag-and-drop / open file).

pub fn import_media_paths(file_paths: &[String], existing: &[MediaItem]) -> ScanResult {
    use std::collections::HashSet;

    let existing_ids: HashSet<String> = existing.iter().map(|item| item.id.clone()).collect();

    let mut items = Vec::new();

    let mut added = 0usize;

    let mut skipped = 0usize;

    let mut errors = Vec::new();

    let mut skipped_items = Vec::new();

    for path_str in file_paths {
        let trimmed = path_str.trim();

        if trimmed.is_empty() {
            continue;
        }

        let path = PathBuf::from(trimmed);

        if let Some(reason) = should_skip_media_file(&path) {
            skipped += 1;

            skipped_items.push(SkippedMediaEntry {
                path: trimmed.to_string(),

                reason: reason.as_str().to_string(),
            });

            continue;
        }

        match media_item_from_path(path) {
            Ok(item) => {
                if existing_ids.contains(&item.id) {
                    skipped += 1;
                } else {
                    added += 1;

                    items.push(item);
                }
            }

            Err(message) => errors.push(format!("{trimmed}: {message}")),
        }
    }

    items.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

    ScanResult {
        items,

        added,

        skipped,

        errors,

        subtitle_index: HashMap::new(),

        skipped_items,
    }
}

pub fn validate_media_path(file_path: &str) -> crate::models::ValidationResult {
    let path = Path::new(file_path);

    if !path.exists() {
        return crate::models::ValidationResult {
            valid: false,

            exists: false,

            kind: None,

            error: Some("file not found".to_string()),
        };
    }

    if let Some(reason) = should_skip_media_file(path) {
        return crate::models::ValidationResult {
            valid: false,

            exists: true,

            kind: None,

            error: Some(reason.as_str().to_string()),
        };
    }

    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    let extension_info = get_extension_info(file_name);

    let kind = detect_media_kind_from_extension(&extension_info);

    if kind.is_none() {
        return crate::models::ValidationResult {
            valid: false,

            exists: true,

            kind: None,

            error: Some("unsupported media extension".to_string()),
        };
    }

    crate::models::ValidationResult {
        valid: true,

        exists: true,

        kind,

        error: None,
    }
}

pub fn sanitize_media_items(items: Vec<MediaItem>) -> Vec<MediaItem> {
    items
        .into_iter()
        .filter(|item| {
            crate::services::media_file_filter::should_include_cached_media_item(
                &item.file_path,
                &item.file_name,
            )
        })
        .collect()
}

#[cfg(test)]

mod tests {

    use super::*;

    use std::io::Write;

    use tempfile::tempdir;

    #[test]

    fn detects_extensions() {
        assert_eq!(
            detect_media_kind_from_extension(&get_extension_info("file.mp3")),
            Some(MediaKind::Audio)
        );

        assert_eq!(
            detect_media_kind_from_extension(&get_extension_info("file.MKV")),
            Some(MediaKind::Video)
        );

        assert!(detect_media_kind_from_extension(&get_extension_info("file.txt")).is_none());

        assert!(detect_media_kind_from_extension(&get_extension_info("file.ts")).is_none());
    }

    #[test]

    fn stable_id_is_deterministic() {
        let path = Path::new("C:\\music\\track.flac");

        let a = media_id_for_path(path);

        let b = media_id_for_path(path);

        assert_eq!(a, b);

        assert_eq!(a.len(), 40);
    }

    #[test]

    fn rejects_file_path_as_scan_root() {
        let dir = tempdir().unwrap();

        let file = dir.path().join("not-a-dir.txt");

        std::fs::File::create(&file).unwrap();

        let err = validate_scan_root(file.to_str().unwrap()).unwrap_err();

        assert!(err.contains("not a folder"));
    }

    #[test]

    fn import_mkv_path_adds_video_item() {
        let dir = tempdir().unwrap();

        let file = dir.path().join("clip.mkv");

        std::fs::File::create(&file).unwrap();

        let result = import_media_paths(&[file.to_string_lossy().to_string()], &[]);

        assert_eq!(result.added, 1);

        assert_eq!(result.items.len(), 1);

        assert_eq!(result.items[0].kind, MediaKind::Video);
    }

    #[test]

    fn empty_folder_returns_no_items() {
        let dir = tempdir().unwrap();

        let result = scan_folder(dir.path().to_str().unwrap(), None, &[]);

        assert_eq!(result.added, 0);

        assert!(result.items.is_empty());
    }

    #[test]

    fn skips_unsupported_files() {
        let dir = tempdir().unwrap();

        let txt = dir.path().join("notes.txt");

        std::fs::File::create(&txt)
            .unwrap()
            .write_all(b"x")
            .unwrap();

        let mp3 = dir.path().join("song.mp3");

        std::fs::File::create(&mp3)
            .unwrap()
            .write_all(b"x")
            .unwrap();

        let result = scan_folder(dir.path().to_str().unwrap(), None, &[]);

        assert_eq!(result.added, 1);

        assert_eq!(result.items.len(), 1);

        assert_eq!(result.items[0].kind, MediaKind::Audio);
    }

    #[test]

    fn never_indexes_d_ts_files() {
        let dir = tempdir().unwrap();

        let dts = dir.path().join("AcceleratedRendererSettings.d.ts");

        std::fs::File::create(&dts)
            .unwrap()
            .write_all(b"export {}")
            .unwrap();

        let mkv = dir.path().join("show.mkv");

        std::fs::File::create(&mkv)
            .unwrap()
            .write_all(b"x")
            .unwrap();

        let result = scan_folder(dir.path().to_str().unwrap(), None, &[]);

        assert_eq!(result.added, 1);

        assert_eq!(result.items.len(), 1);

        assert!(!result.items[0].file_name.ends_with(".d.ts"));

        assert!(result
            .skipped_items
            .iter()
            .any(|s| s.path.contains("AcceleratedRendererSettings.d.ts")));
    }

    #[test]

    fn sanitize_removes_polluted_cache_items() {
        let polluted = MediaItem {
            id: "x".into(),

            file_path: "C:\\dev\\types\\AcceleratedRendererSettings.d.ts".into(),

            file_name: "AcceleratedRendererSettings.d.ts".into(),

            title: "AcceleratedRendererSettings".into(),

            folder: "C:\\dev\\types".into(),

            extension: ".ts".into(),

            kind: MediaKind::Video,

            size: 1,

            mtime_ms: Some(1),

            modified_at: "now".into(),

            duration_seconds: None,

            search_text: None,

            folder_label: None,

            tags: vec![],

            favorite: false,
        };

        let clean = sanitize_media_items(vec![polluted]);

        assert!(clean.is_empty());
    }
}
