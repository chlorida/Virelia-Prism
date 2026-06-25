use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::services::ffmpeg_util::{self, FfmpegPaths};
use crate::services::process_util::hidden_command;

pub const THUMB_CACHE_VERSION: u32 = 1;
const THUMB_FAILURE_COOLDOWN_MS: u64 = 5 * 60 * 1000;
const MIN_BYTES: u64 = 800;
const MAX_CONCURRENT: usize = 1;

static THUMB_STATE: Mutex<Option<ThumbnailState>> = Mutex::new(None);

struct ThumbnailState {
    records: HashMap<String, ThumbnailRecord>,
    cache_key_to_media: HashMap<String, HashSet<String>>,
    pending_keys: HashSet<String>,
    queue: VecDeque<QueueJob>,
    active_jobs: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailRecord {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_thumbnail_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempted_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_key: Option<String>,
}

#[derive(Debug, Clone)]
struct QueueJob {
    media_id: String,
    file_path: String,
    cache_key: String,
    priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThumbnailCacheMeta {
    version: u32,
    cache_key: String,
    source_path: String,
    source_size: u64,
    source_mtime: u64,
    generated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    small_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    large_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    failed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attempted_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after: Option<u64>,
}

fn with_state<F, R>(f: F) -> R
where
    F: FnOnce(&mut ThumbnailState) -> R,
{
    let mut guard = THUMB_STATE.lock().expect("thumbnail state lock");
    if guard.is_none() {
        *guard = Some(ThumbnailState {
            records: HashMap::new(),
            cache_key_to_media: HashMap::new(),
            pending_keys: HashSet::new(),
            queue: VecDeque::new(),
            active_jobs: 0,
        });
    }
    f(guard.as_mut().expect("thumbnail state"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_media_path(file_path: &str) -> String {
    file_path
        .replace('\\', "/")
        .split('/')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("/")
        .to_lowercase()
}

pub fn compute_thumbnail_cache_key(file_path: &str, size: u64, mtime: u64) -> String {
    let normalized = normalize_media_path(file_path);
    let input = format!("{THUMB_CACHE_VERSION}|{normalized}|{size}|{mtime}");
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())[..24].to_string()
}

fn thumb_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = dir.join("thumb-cache");
    fs::create_dir_all(root.join("small")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("large")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("meta")).map_err(|e| e.to_string())?;
    Ok(root)
}

fn variant_path(root: &Path, cache_key: &str, variant: &str) -> PathBuf {
    root.join(variant).join(format!("{cache_key}.jpg"))
}

fn meta_path(root: &Path, cache_key: &str) -> PathBuf {
    root.join("meta").join(format!("{cache_key}.json"))
}

fn is_video_file(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    [
        ".mkv", ".mp4", ".webm", ".avi", ".mov", ".m4v", ".wmv", ".flv", ".ts", ".m2ts",
    ]
    .iter()
    .any(|ext| lower.ends_with(ext))
}

fn is_valid_image(path: &Path) -> bool {
    fs::metadata(path)
        .map(|m| m.len() > MIN_BYTES)
        .unwrap_or(false)
}

fn read_meta(root: &Path, cache_key: &str) -> Option<ThumbnailCacheMeta> {
    let raw = fs::read_to_string(meta_path(root, cache_key)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_meta(root: &Path, cache_key: &str, meta: &ThumbnailCacheMeta) -> Result<(), String> {
    let serialized = serde_json::to_string(meta).map_err(|e| e.to_string())?;
    fs::write(meta_path(root, cache_key), serialized).map_err(|e| e.to_string())
}

fn stat_source(file_path: &str) -> Option<(u64, u64)> {
    let meta = fs::metadata(file_path).ok()?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .or_else(|_| meta.created())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some((size, mtime))
}

fn record_ready(
    small: Option<PathBuf>,
    large: Option<PathBuf>,
    cache_key: &str,
) -> ThumbnailRecord {
    let small_str = small.as_ref().map(|p| p.to_string_lossy().to_string());
    let large_str = large.as_ref().map(|p| p.to_string_lossy().to_string());
    ThumbnailRecord {
        status: "ready".to_string(),
        thumbnail_path: small_str.clone().or_else(|| large_str.clone()),
        large_thumbnail_path: large_str.clone().or(small_str.clone()),
        url: small_str.clone().or_else(|| large_str.clone()),
        large_url: large_str.or(small_str),
        error: None,
        attempted_at: None,
        cache_key: Some(cache_key.to_string()),
    }
}

fn resolve_ready_from_disk(
    app: &AppHandle,
    file_path: &str,
    cache_key: &str,
    size: u64,
    mtime: u64,
) -> Result<Option<ThumbnailRecord>, String> {
    let root = thumb_cache_root(app)?;
    let meta = read_meta(&root, cache_key);
    let now = now_ms();

    if let Some(ref m) = meta {
        if m.failed == Some(true) {
            let retry_after = m.retry_after.unwrap_or(0);
            let attempted = m.attempted_at.unwrap_or(0);
            if now < retry_after || now.saturating_sub(attempted) < THUMB_FAILURE_COOLDOWN_MS {
                return Ok(Some(ThumbnailRecord {
                    status: "failed".to_string(),
                    thumbnail_path: None,
                    large_thumbnail_path: None,
                    url: None,
                    large_url: None,
                    error: m.reason.clone(),
                    attempted_at: m.attempted_at,
                    cache_key: Some(cache_key.to_string()),
                }));
            }
        }

        if m.version == THUMB_CACHE_VERSION
            && normalize_media_path(&m.source_path) == normalize_media_path(file_path)
            && m.source_size == size
            && m.source_mtime == mtime
            && m.failed != Some(true)
        {
            let small = m
                .small_path
                .as_ref()
                .filter(|p| is_valid_image(Path::new(p)))
                .cloned();
            let large = m
                .large_path
                .as_ref()
                .filter(|p| is_valid_image(Path::new(p)))
                .cloned();
            if small.is_some() || large.is_some() {
                return Ok(Some(record_ready(
                    small.map(PathBuf::from),
                    large.map(PathBuf::from),
                    cache_key,
                )));
            }
        }
    }

    let small_path = variant_path(&root, cache_key, "small");
    let large_path = variant_path(&root, cache_key, "large");
    let small_ok = is_valid_image(&small_path);
    let large_ok = is_valid_image(&large_path);
    if small_ok || large_ok {
        let ready_meta = ThumbnailCacheMeta {
            version: THUMB_CACHE_VERSION,
            cache_key: cache_key.to_string(),
            source_path: file_path.to_string(),
            source_size: size,
            source_mtime: mtime,
            generated_at: now,
            small_path: small_ok.then(|| small_path.to_string_lossy().to_string()),
            large_path: large_ok.then(|| large_path.to_string_lossy().to_string()),
            failed: None,
            reason: None,
            attempted_at: None,
            retry_after: None,
        };
        write_meta(&root, cache_key, &ready_meta)?;
        return Ok(Some(record_ready(
            small_ok.then_some(small_path),
            large_ok.then_some(large_path),
            cache_key,
        )));
    }

    Ok(None)
}

fn extract_frame(
    ffmpeg: &Path,
    file_path: &str,
    out_path: &Path,
    timestamp: &str,
    width: u32,
) -> bool {
    let status = hidden_command(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "fatal",
            "-nostdin",
            "-i",
            file_path,
            "-ss",
            timestamp,
            "-an",
            "-sn",
            "-frames:v",
            "1",
            "-vf",
            &format!("scale={width}:-1"),
            "-q:v",
            if width >= 640 { "4" } else { "5" },
            "-y",
            &out_path.to_string_lossy(),
        ])
        .stderr(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .status();
    status
        .map(|s| s.success() && is_valid_image(out_path))
        .unwrap_or(false)
}

fn generate_variants(
    ffmpeg: &FfmpegPaths,
    file_path: &str,
    root: &Path,
    cache_key: &str,
) -> (Option<PathBuf>, Option<PathBuf>) {
    let small_out = variant_path(root, cache_key, "small");
    let large_out = variant_path(root, cache_key, "large");
    let attempts = ["00:01:00", "00:00:12", "00:02:30", "00:00:35"];
    let mut small = None;
    let mut large = None;

    for ts in attempts {
        if small.is_none() && extract_frame(&ffmpeg.ffmpeg, file_path, &small_out, ts, 320) {
            small = Some(small_out.clone());
        }
        if large.is_none() && extract_frame(&ffmpeg.ffmpeg, file_path, &large_out, ts, 640) {
            large = Some(large_out.clone());
        }
        if small.is_some() && large.is_some() {
            break;
        }
    }

    if small.is_none() {
        if let Some(ref l) = large {
            if fs::copy(l, &small_out).is_ok() && is_valid_image(&small_out) {
                small = Some(small_out);
            }
        }
    }

    (small, large)
}

fn mark_failure(
    root: &Path,
    cache_key: &str,
    file_path: &str,
    size: u64,
    mtime: u64,
    reason: &str,
) {
    let attempted_at = now_ms();
    let _ = write_meta(
        root,
        cache_key,
        &ThumbnailCacheMeta {
            version: THUMB_CACHE_VERSION,
            cache_key: cache_key.to_string(),
            source_path: file_path.to_string(),
            source_size: size,
            source_mtime: mtime,
            generated_at: attempted_at,
            small_path: None,
            large_path: None,
            failed: Some(true),
            reason: Some(reason.to_string()),
            attempted_at: Some(attempted_at),
            retry_after: Some(attempted_at + THUMB_FAILURE_COOLDOWN_MS),
        },
    );
}

fn set_record(
    state: &mut ThumbnailState,
    media_id: &str,
    record: ThumbnailRecord,
) -> ThumbnailRecord {
    if let Some(ref key) = record.cache_key {
        let ids = state.cache_key_to_media.entry(key.clone()).or_default();
        ids.insert(media_id.to_string());
        for id in ids.clone() {
            state.records.insert(id, record.clone());
        }
    } else {
        state.records.insert(media_id.to_string(), record.clone());
    }
    record
}

fn process_job(app: &AppHandle, job: QueueJob) -> ThumbnailRecord {
    let media_id = job.media_id.clone();
    let file_path = job.file_path.clone();
    let cache_key = job.cache_key.clone();

    let finish = {
        let cache_key_for_finish = cache_key.clone();
        let media_id_for_finish = media_id.clone();
        move |record: ThumbnailRecord| {
            with_state(|state| {
                state.pending_keys.remove(&cache_key_for_finish);
                set_record(state, &media_id_for_finish, record)
            })
        }
    };

    let (size, mtime) = stat_source(&file_path).unwrap_or((0, 0));

    if !Path::new(&file_path).exists() {
        return finish(ThumbnailRecord {
            status: "file-missing".to_string(),
            thumbnail_path: None,
            large_thumbnail_path: None,
            url: None,
            large_url: None,
            error: Some("File not found on disk".to_string()),
            attempted_at: Some(now_ms()),
            cache_key: Some(cache_key),
        });
    }

    if let Ok(Some(ready)) = resolve_ready_from_disk(app, &file_path, &cache_key, size, mtime) {
        return finish(ready);
    }

    let resource_dir = app.path().resource_dir().ok();
    let ffmpeg = match ffmpeg_util::locate_ffmpeg(resource_dir.as_deref()) {
        Ok(paths) => paths,
        Err(_) => {
            return finish(ThumbnailRecord {
                status: "ffmpeg-missing".to_string(),
                thumbnail_path: None,
                large_thumbnail_path: None,
                url: None,
                large_url: None,
                error: Some("Thumbnail engine not found".to_string()),
                attempted_at: Some(now_ms()),
                cache_key: Some(cache_key),
            });
        }
    };

    let root = match thumb_cache_root(app) {
        Ok(r) => r,
        Err(e) => {
            return finish(ThumbnailRecord {
                status: "failed".to_string(),
                thumbnail_path: None,
                large_thumbnail_path: None,
                url: None,
                large_url: None,
                error: Some(e),
                attempted_at: Some(now_ms()),
                cache_key: Some(cache_key),
            });
        }
    };

    with_state(|state| {
        set_record(
            state,
            &media_id,
            ThumbnailRecord {
                status: "generating".to_string(),
                thumbnail_path: None,
                large_thumbnail_path: None,
                url: None,
                large_url: None,
                error: None,
                attempted_at: Some(now_ms()),
                cache_key: Some(cache_key.clone()),
            },
        )
    });

    let (small, large) = generate_variants(&ffmpeg, &file_path, &root, &cache_key);
    if small.is_some() || large.is_some() {
        let _ = write_meta(
            &root,
            &cache_key,
            &ThumbnailCacheMeta {
                version: THUMB_CACHE_VERSION,
                cache_key: cache_key.clone(),
                source_path: file_path.clone(),
                source_size: size,
                source_mtime: mtime,
                generated_at: now_ms(),
                small_path: small.as_ref().map(|p| p.to_string_lossy().to_string()),
                large_path: large.as_ref().map(|p| p.to_string_lossy().to_string()),
                failed: None,
                reason: None,
                attempted_at: None,
                retry_after: None,
            },
        );
        return finish(record_ready(small, large, &cache_key));
    }

    mark_failure(
        &root,
        &cache_key,
        &file_path,
        size,
        mtime,
        "Frame extraction failed",
    );
    finish(ThumbnailRecord {
        status: "failed".to_string(),
        thumbnail_path: None,
        large_thumbnail_path: None,
        url: None,
        large_url: None,
        error: Some("Frame extraction failed".to_string()),
        attempted_at: Some(now_ms()),
        cache_key: Some(cache_key),
    })
}

fn pump_queue(app: &AppHandle) {
    loop {
        let job = with_state(|state| {
            if state.active_jobs >= MAX_CONCURRENT {
                return None;
            }
            let mut jobs: Vec<_> = state.queue.drain(..).collect();
            jobs.sort_by(|a, b| b.priority.cmp(&a.priority));
            state.queue = jobs.into();
            let job = state.queue.pop_front();
            if job.is_some() {
                state.active_jobs += 1;
            }
            job
        });
        let Some(job) = job else { break };
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let _record = process_job(&app_clone, job);
            with_state(|state| {
                state.active_jobs = state.active_jobs.saturating_sub(1);
            });
            pump_queue(&app_clone);
        });
    }
}

pub fn get_thumbnail(
    app: &AppHandle,
    media_id: String,
    file_path: String,
    file_name: String,
    priority: i32,
) -> Result<ThumbnailRecord, String> {
    if !is_video_file(&file_name) {
        return Ok(with_state(|state| {
            set_record(
                state,
                &media_id,
                ThumbnailRecord {
                    status: "unsupported".to_string(),
                    thumbnail_path: None,
                    large_thumbnail_path: None,
                    url: None,
                    large_url: None,
                    error: Some("Not a video file".to_string()),
                    attempted_at: None,
                    cache_key: None,
                },
            )
        }));
    }

    if !Path::new(&file_path).exists() {
        return Ok(with_state(|state| {
            set_record(
                state,
                &media_id,
                ThumbnailRecord {
                    status: "file-missing".to_string(),
                    thumbnail_path: None,
                    large_thumbnail_path: None,
                    url: None,
                    large_url: None,
                    error: Some("File not found on disk".to_string()),
                    attempted_at: None,
                    cache_key: None,
                },
            )
        }));
    }

    let (size, mtime) = stat_source(&file_path).unwrap_or((0, 0));
    let cache_key = compute_thumbnail_cache_key(&file_path, size, mtime);

    if let Some(existing) = with_state(|state| state.records.get(&media_id).cloned()) {
        if existing.status == "ready" && existing.url.is_some() {
            return Ok(existing);
        }
    }

    if let Ok(Some(ready)) = resolve_ready_from_disk(app, &file_path, &cache_key, size, mtime) {
        return Ok(with_state(|state| set_record(state, &media_id, ready)));
    }

    let should_queue = with_state(|state| {
        if state.pending_keys.contains(&cache_key) {
            return false;
        }
        state.pending_keys.insert(cache_key.clone());
        state.queue.push_back(QueueJob {
            media_id: media_id.clone(),
            file_path: file_path.clone(),
            cache_key: cache_key.clone(),
            priority,
        });
        true
    });

    if should_queue {
        pump_queue(app);
        Ok(with_state(|state| {
            set_record(
                state,
                &media_id,
                ThumbnailRecord {
                    status: "queued".to_string(),
                    thumbnail_path: None,
                    large_thumbnail_path: None,
                    url: None,
                    large_url: None,
                    error: None,
                    attempted_at: Some(now_ms()),
                    cache_key: Some(cache_key),
                },
            )
        }))
    } else {
        Ok(with_state(|state| {
            state
                .records
                .get(&media_id)
                .cloned()
                .unwrap_or(ThumbnailRecord {
                    status: "queued".to_string(),
                    thumbnail_path: None,
                    large_thumbnail_path: None,
                    url: None,
                    large_url: None,
                    error: None,
                    attempted_at: Some(now_ms()),
                    cache_key: Some(cache_key),
                })
        }))
    }
}

pub fn retry_thumbnail(
    app: &AppHandle,
    media_id: String,
    file_path: String,
    _file_name: String,
) -> Result<ThumbnailRecord, String> {
    let (size, mtime) = stat_source(&file_path).unwrap_or((0, 0));
    let cache_key = compute_thumbnail_cache_key(&file_path, size, mtime);
    let root = thumb_cache_root(app)?;
    let _ = fs::remove_file(meta_path(&root, &cache_key));
    let _ = fs::remove_file(variant_path(&root, &cache_key, "small"));
    let _ = fs::remove_file(variant_path(&root, &cache_key, "large"));
    with_state(|state| {
        state.records.remove(&media_id);
        state.pending_keys.remove(&cache_key);
    });
    get_thumbnail(app, media_id, file_path, _file_name, 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_changes_with_mtime() {
        let a = compute_thumbnail_cache_key("D:/Anime/ep01.mkv", 1024, 100);
        let b = compute_thumbnail_cache_key("D:/Anime/ep01.mkv", 1024, 200);
        assert_ne!(a, b);
    }
}
