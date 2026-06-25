use crate::models::{SubtitleCacheMetadata, SubtitleFormat, SubtitleSource, SubtitleTrack};
use crate::services::scanner::media_id_for_path;
use crate::services::subtitle_cue::parse_subtitle_file_cues;
use crate::services::subtitle_cue_quality::{
    analyze_cues, validate_generated_coverage, GENERATION_PIPELINE_VERSION,
};
use crate::services::subtitle_generation_pipeline::GeneratedSubtitleMetadata;
use crate::services::subtitle_language::language_label;
use crate::services::process_util::hidden_command;
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};

const METADATA_FILE: &str = "metadata.json";

pub fn video_file_fingerprint(path: &Path) -> Result<(u64, u64), String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified_at = meta
        .modified()
        .or_else(|_| meta.created())
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    Ok((meta.len(), modified_at))
}

pub fn video_hash(path: &Path, file_size: u64, modified_at: u64) -> String {
    let normalized = path.to_string_lossy().to_lowercase();
    let mut hasher = Sha1::new();
    hasher.update(normalized.as_bytes());
    hasher.update(file_size.to_le_bytes());
    hasher.update(modified_at.to_le_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn cache_root(app_data: &Path) -> PathBuf {
    app_data.join("subtitle-cache")
}

pub fn video_cache_dir(app_data: &Path, hash: &str) -> PathBuf {
    cache_root(app_data).join(hash)
}

pub fn resolve_video_cache_dir(app_data: &Path, video_path: &Path) -> Result<PathBuf, String> {
    let (size, mtime) = video_file_fingerprint(video_path)?;
    let hash = video_hash(video_path, size, mtime);
    Ok(video_cache_dir(app_data, &hash))
}

pub fn generated_subtitle_path(
    cache_dir: &Path,
    language: &str,
    format: SubtitleFormat,
) -> PathBuf {
    cache_dir.join(format!("generated.{language}.{}", format.as_str()))
}

pub fn generated_partial_subtitle_path(
    cache_dir: &Path,
    language: &str,
    format: SubtitleFormat,
) -> PathBuf {
    cache_dir.join(format!("generated.{language}.partial.{}", format.as_str()))
}

fn parse_generated_cache_filename(name: &str) -> Option<(String, SubtitleFormat, bool)> {
    if !name.starts_with("generated.") {
        return None;
    }
    let parts: Vec<&str> = name.split('.').collect();
    if parts.len() < 3 {
        return None;
    }
    if parts.len() >= 4 && parts[2] == "partial" {
        let lang = parts[1].to_string();
        let format = SubtitleFormat::from_extension(parts[3])?;
        return Some((lang, format, true));
    }
    let lang = parts[1].to_string();
    let format = SubtitleFormat::from_extension(parts[2])?;
    Some((lang, format, false))
}

pub fn metadata_path(cache_dir: &Path) -> PathBuf {
    cache_dir.join(METADATA_FILE)
}

pub fn read_metadata(cache_dir: &Path) -> Option<SubtitleCacheMetadata> {
    let path = metadata_path(cache_dir);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn write_metadata(cache_dir: &Path, metadata: &SubtitleCacheMetadata) -> Result<(), String> {
    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let path = metadata_path(cache_dir);
    let json = serde_json::to_string_pretty(metadata).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn read_generation_sidecar(
    cache_dir: &Path,
    target_language: &str,
) -> Option<GeneratedSubtitleMetadata> {
    let path = cache_dir.join(format!("generated.{target_language}.meta.json"));
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn clear_generated_target(
    cache_dir: &Path,
    target_language: &str,
    format: SubtitleFormat,
) -> Result<(), String> {
    let out = generated_subtitle_path(cache_dir, target_language, format);
    if out.exists() {
        fs::remove_file(&out).map_err(|e| e.to_string())?;
    }
    let partial = generated_partial_subtitle_path(cache_dir, target_language, format);
    if partial.exists() {
        fs::remove_file(&partial).map_err(|e| e.to_string())?;
    }
    let sidecar = cache_dir.join(format!("generated.{target_language}.meta.json"));
    if sidecar.exists() {
        fs::remove_file(&sidecar).map_err(|e| e.to_string())?;
    }
    let partial_meta = cache_dir.join(format!("generated.{target_language}.partial.meta.json"));
    if partial_meta.exists() {
        fs::remove_file(&partial_meta).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn is_generation_sidecar_valid(sidecar: &GeneratedSubtitleMetadata, video_key: &str) -> bool {
    if sidecar.pipeline_version != GENERATION_PIPELINE_VERSION
        || sidecar.video_key != video_key
        || !sidecar.is_valid
        || sidecar.speech_cue_count == 0
    {
        return false;
    }
    if let Some(duration) = sidecar.video_duration_sec {
        if duration > 60.0 && sidecar.cue_count <= 1 {
            return false;
        }
        if duration > 300.0 && sidecar.cue_count < 5 {
            return false;
        }
        if duration > 1200.0 && sidecar.cue_count < 20 {
            return false;
        }
        if let Some(ratio) = sidecar.coverage_ratio {
            if duration > 60.0 && ratio < 0.05 {
                return false;
            }
        }
    }
    true
}

fn revalidate_generated_file(
    path: &Path,
    format: SubtitleFormat,
    sidecar: &GeneratedSubtitleMetadata,
) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    let cues = parse_subtitle_file_cues(&raw, format.as_str());
    if cues.is_empty() {
        return Some("parse-failed-after-generation".to_string());
    }
    let stats = analyze_cues(&cues);
    validate_generated_coverage(&cues, &stats, sidecar.video_duration_sec, Some(raw.len())).err()
}

pub fn is_cache_valid(
    cache_dir: &Path,
    video_path: &Path,
    language: &str,
    model: &str,
    format: &str,
) -> bool {
    let Ok((size, mtime)) = video_file_fingerprint(video_path) else {
        return false;
    };
    let Some(meta) = read_metadata(cache_dir) else {
        return false;
    };
    let video_key = media_id_for_path(video_path);
    let sidecar_ok = read_generation_sidecar(cache_dir, language)
        .map(|s| is_generation_sidecar_valid(&s, &video_key))
        .unwrap_or(false);
    meta.video_path == video_path.to_string_lossy()
        && meta.file_size == size
        && meta.modified_at == mtime
        && meta.language == language
        && meta.model == model
        && meta.format == format
        && sidecar_ok
}

pub fn load_generated_tracks_from_cache(
    video_id: &str,
    video_path: &str,
    video_key: &str,
    hash_or_dir: &Path,
) -> Vec<SubtitleTrack> {
    let cache_dir = if hash_or_dir.is_dir() {
        hash_or_dir.to_path_buf()
    } else {
        return Vec::new();
    };
    let mut tracks = Vec::new();
    let mut recovered_partial_langs: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    let read_dir = match fs::read_dir(&cache_dir) {
        Ok(rd) => rd,
        Err(_) => return tracks,
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let Some((lang, format, is_partial_file)) = parse_generated_cache_filename(name) else {
            continue;
        };
        let sidecar = read_generation_sidecar(&cache_dir, &lang);
        let partial_meta_path = cache_dir.join(format!("generated.{lang}.partial.meta.json"));
        let partial_meta: Option<serde_json::Value> = if partial_meta_path.exists() {
            fs::read_to_string(&partial_meta_path)
                .ok()
                .and_then(|raw| serde_json::from_str(&raw).ok())
        } else {
            None
        };
        let recovered_from_failure = partial_meta
            .as_ref()
            .and_then(|v| v.get("recoveredFromFailure"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let file_meta = read_metadata(&cache_dir);
        let (generated_at, confidence) = file_meta
            .as_ref()
            .map(|m| (Some(m.generated_at), m.confidence))
            .unwrap_or((None, None));

        let mut valid = false;
        let mut invalid_reason: Option<String> = None;
        let mut pipeline_version: Option<u32> = None;
        let mut generated_until_seconds: Option<f64> = partial_meta
            .as_ref()
            .and_then(|v| v.get("coverageUntilSeconds"))
            .and_then(|v| v.as_f64());
        let mut label = if is_partial_file {
            if recovered_from_failure {
                format!("{} — recovered partial", language_label(&lang))
            } else {
                format!("{} — live partial", language_label(&lang))
            }
        } else {
            format!("Generated — {}", language_label(&lang))
        };

        if is_partial_file {
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let cues = parse_subtitle_file_cues(&raw, format.as_str());
            let speech_count = cues
                .iter()
                .filter(|c| !crate::services::subtitle_cue_quality::is_non_speech_cue(&c.text))
                .count();
            if speech_count > 0 {
                valid = true;
                if generated_until_seconds.is_none() {
                    generated_until_seconds =
                        Some(cues.iter().map(|c| c.end).fold(0.0_f64, f64::max));
                }
                if recovered_from_failure {
                    invalid_reason = partial_meta
                        .as_ref()
                        .and_then(|v| v.get("invalidReason"))
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                }
            } else {
                invalid_reason = Some("no_speech".to_string());
            }
        } else if let Some(meta) = sidecar.as_ref() {
            if meta.generation_method.contains("translate") {
                label = format!("Translated — {}", language_label(&lang));
            }
            pipeline_version = Some(meta.pipeline_version);
            if meta.video_key != video_key {
                invalid_reason = Some("wrong_video".to_string());
            } else {
                let file_reason = revalidate_generated_file(&path, format, meta);
                if let Some(reason) = file_reason {
                    invalid_reason = Some(reason);
                } else if meta.pipeline_version != GENERATION_PIPELINE_VERSION {
                    invalid_reason = Some("stale_pipeline".to_string());
                } else if !meta.is_valid || meta.speech_cue_count == 0 {
                    invalid_reason = Some(
                        meta.invalid_reason
                            .clone()
                            .unwrap_or_else(|| "no_speech".to_string()),
                    );
                } else {
                    valid = true;
                }
            }
        } else {
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let cues = parse_subtitle_file_cues(&raw, format.as_str());
            if cues.is_empty() {
                invalid_reason = Some("stale_pipeline".to_string());
            } else {
                invalid_reason = Some("stale_pipeline".to_string());
            }
        }

        if !valid {
            if is_partial_file {
                label = format!("{label} (invalid)");
            } else {
                label = format!("{label} (invalid)");
            }
            eprintln!(
                "[Virelia subtitles] invalid generated track videoKey={video_key} lang={lang} reason={:?} path={}",
                invalid_reason,
                path.display()
            );
        } else if import_meta_env_is_dev() {
            eprintln!(
                "[Virelia subtitles] valid generated track lang={lang} cues={} speech={}",
                sidecar.as_ref().map(|m| m.cue_count).unwrap_or(0),
                sidecar.as_ref().map(|m| m.speech_cue_count).unwrap_or(0),
            );
        }

        let track_id = if is_partial_file {
            format!("{video_key}-generated-partial-{lang}")
        } else {
            format!("{video_key}-generated-{lang}")
        };

        if is_partial_file && recovered_from_failure && valid {
            recovered_partial_langs.insert(lang.clone());
        }

        tracks.push(SubtitleTrack {
            id: track_id,
            video_id: video_id.to_string(),
            video_path: video_path.to_string(),
            video_key: video_key.to_string(),
            source: SubtitleSource::Generated,
            language: lang.clone(),
            language_label: language_label(&lang),
            label,
            format,
            path: Some(path.to_string_lossy().to_string()),
            embedded_track_index: None,
            generated_at,
            confidence,
            is_default: None,
            generation_valid: Some(valid),
            generation_invalid_reason: invalid_reason,
            generation_pipeline_version: pipeline_version,
            is_partial: Some(is_partial_file),
            is_live_updating: Some(false),
            generated_until_seconds,
            recovered_from_failure: Some(recovered_from_failure),
        });
    }
    tracks.retain(|track| {
        if track.is_partial == Some(true) {
            return true;
        }
        if track.generation_valid == Some(false)
            && recovered_partial_langs.contains(&track.language)
        {
            return false;
        }
        true
    });
    tracks
}

fn import_meta_env_is_dev() -> bool {
    cfg!(debug_assertions)
}

pub fn clear_all_generated_cache(app_data: &Path) -> Result<(), String> {
    let root = cache_root(app_data);
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn clear_video_cache(app_data: &Path, video_path: &Path) -> Result<(), String> {
    let cache_dir = resolve_video_cache_dir(app_data, video_path)?;
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn extract_embedded_to_cache(
    ffmpeg: &Path,
    video_path: &Path,
    cache_dir: &Path,
    track_index: u32,
    output_format: SubtitleFormat,
) -> Result<PathBuf, String> {
    fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let out_path = cache_dir.join(format!("embedded.{track_index}.{}", output_format.as_str()));
    let mut cmd = hidden_command(ffmpeg);
    cmd.args(["-y", "-i"])
        .arg(video_path)
        .args(["-map", &format!("0:{track_index}")])
        .arg("-c:s")
        .arg("copy");

    match output_format {
        SubtitleFormat::Vtt => {
            cmd.args(["-f", "webvtt"]);
        }
        SubtitleFormat::Srt => {
            cmd.args(["-f", "srt"]);
        }
        SubtitleFormat::Ass | SubtitleFormat::Ssa => {
            cmd.args(["-f", "ass"]);
        }
    }
    cmd.arg(&out_path);
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Embedded subtitle extraction failed: {stderr}"));
    }
    if !out_path.exists() {
        // Re-encode to VTT for ASS if copy failed
        if matches!(output_format, SubtitleFormat::Vtt) {
            return convert_subtitle_to_vtt(ffmpeg, video_path, track_index, &out_path);
        }
        return Err("Embedded subtitle extraction failed.".to_string());
    }
    Ok(out_path)
}

fn convert_subtitle_to_vtt(
    ffmpeg: &Path,
    video_path: &Path,
    track_index: u32,
    out_path: &Path,
) -> Result<PathBuf, String> {
    let output = hidden_command(ffmpeg)
        .args(["-y", "-i"])
        .arg(video_path)
        .args(["-map", &format!("0:{track_index}")])
        .args(["-f", "webvtt"])
        .arg(out_path)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() && out_path.exists() {
        Ok(out_path.to_path_buf())
    } else {
        Err("Embedded subtitle extraction failed.".to_string())
    }
}
