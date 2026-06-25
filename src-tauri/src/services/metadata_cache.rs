use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Manager};

pub const TITLE_METADATA_CACHE_VERSION: u32 = 5;
const IMAGE_FAILURE_COOLDOWN_MS: u64 = 6 * 60 * 60 * 1000;

static IMAGE_FAILURES: LazyLock<Mutex<HashMap<String, u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleMetadataImageResult {
    pub local_path: Option<String>,
    pub display_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed: Option<bool>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = dir.join("metadata-cache");
    fs::create_dir_all(root.join("titles")).map_err(|e| e.to_string())?;
    for sub in ["posters", "backdrops", "banners", "screenshots", "trailers"] {
        fs::create_dir_all(root.join("images").join(sub)).map_err(|e| e.to_string())?;
    }
    Ok(root)
}

fn sanitize_cache_key(cache_key: &str) -> String {
    cache_key
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(120)
        .collect()
}

fn hash_url(url: &str) -> String {
    hex_prefix(&Sha256::digest(url.as_bytes()), 24)
}

fn hex_prefix(bytes: impl AsRef<[u8]>, len: usize) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>()[..len.min(64)]
        .to_string()
}

fn image_subdir(kind: &str) -> &'static str {
    match kind {
        "poster" => "posters",
        "backdrop" => "backdrops",
        "banner" => "banners",
        "trailer" => "trailers",
        _ => "screenshots",
    }
}

fn image_ext_from_url(url: &str) -> String {
    if let Some(path) = url.split('?').next() {
        let lower = path.to_lowercase();
        if lower.ends_with(".png") {
            return ".png".to_string();
        }
        if lower.ends_with(".webp") {
            return ".webp".to_string();
        }
        if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
            return ".jpg".to_string();
        }
    }
    ".jpg".to_string()
}

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    let response = ureq::get(url)
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !(200..300).contains(&status) {
        return Err(format!("HTTP {status}"));
    }

    let mut reader = response.into_reader();
    let mut file = fs::File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_title_metadata(app: &AppHandle, cache_key: &str) -> Result<Option<Value>, String> {
    let root = cache_root(app)?;
    let path = root
        .join("titles")
        .join(format!("{}.json", sanitize_cache_key(cache_key)));
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if parsed.get("version").and_then(|v| v.as_u64()) != Some(TITLE_METADATA_CACHE_VERSION as u64) {
        return Ok(None);
    }
    Ok(Some(parsed))
}

pub fn write_title_metadata(app: &AppHandle, record: Value) -> Result<(), String> {
    let cache_key = record
        .get("cacheKey")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing cacheKey".to_string())?;
    let root = cache_root(app)?;
    let path = root
        .join("titles")
        .join(format!("{}.json", sanitize_cache_key(cache_key)));
    let serialized = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    fs::write(&path, serialized).map_err(|e| e.to_string())
}

pub fn delete_title_metadata(app: &AppHandle, cache_key: &str) -> Result<(), String> {
    let root = cache_root(app)?;
    let path = root
        .join("titles")
        .join(format!("{}.json", sanitize_cache_key(cache_key)));
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn cache_metadata_image(
    app: &AppHandle,
    remote_url: &str,
    kind: &str,
) -> Result<TitleMetadataImageResult, String> {
    if !remote_url.starts_with("http") {
        return Ok(TitleMetadataImageResult {
            local_path: None,
            display_url: None,
            failed: Some(true),
        });
    }

    let fail_key = format!("{kind}:{remote_url}");
    let now = now_ms();
    if let Ok(guard) = IMAGE_FAILURES.lock() {
        if let Some(failed_at) = guard.get(&fail_key) {
            if now.saturating_sub(*failed_at) < IMAGE_FAILURE_COOLDOWN_MS {
                return Ok(TitleMetadataImageResult {
                    local_path: None,
                    display_url: None,
                    failed: Some(true),
                });
            }
        }
    }

    let root = cache_root(app)?;
    let ext = image_ext_from_url(remote_url);
    let file_name = format!("{}{}", hash_url(remote_url), ext);
    let local_path = root
        .join("images")
        .join(image_subdir(kind))
        .join(&file_name);

    if local_path.exists() {
        if let Ok(meta) = fs::metadata(&local_path) {
            if meta.len() > 400 {
                let path_str = local_path.to_string_lossy().to_string();
                return Ok(TitleMetadataImageResult {
                    local_path: Some(path_str.clone()),
                    display_url: Some(path_str),
                    failed: None,
                });
            }
        }
    }

    let tmp = local_path.with_extension("part");
    let download_ok = download_file(remote_url, &tmp).is_ok()
        && tmp.exists()
        && fs::metadata(&tmp).map(|m| m.len() > 400).unwrap_or(false);

    if download_ok {
        if local_path.exists() {
            let _ = fs::remove_file(&local_path);
        }
        fs::rename(&tmp, &local_path).map_err(|e| e.to_string())?;
        let path_str = local_path.to_string_lossy().to_string();
        return Ok(TitleMetadataImageResult {
            local_path: Some(path_str.clone()),
            display_url: Some(path_str),
            failed: None,
        });
    }

    let _ = fs::remove_file(&tmp);
    if let Ok(mut guard) = IMAGE_FAILURES.lock() {
        guard.insert(fail_key, now);
    }
    Ok(TitleMetadataImageResult {
        local_path: None,
        display_url: None,
        failed: Some(true),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_url_is_stable() {
        assert_eq!(hash_url("https://example.com/a.jpg").len(), 24);
    }

    #[test]
    fn sanitize_cache_key_strips_unsafe_chars() {
        assert_eq!(sanitize_cache_key("foo/bar:baz"), "foo_bar_baz");
    }
}
