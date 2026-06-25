use crate::models::SubtitleDiscoveryDebug;
use crate::models::{
    DiscoverSubtitlesResult, ExternalSubtitleIndexEntry, SubtitleFormat, SubtitleSource,
    SubtitleTrack,
};
use crate::services::ffmpeg_util::locate_ffmpeg;
use crate::services::scanner::media_id_for_path;
use crate::services::subtitle_cache::load_generated_tracks_from_cache;
use crate::services::subtitle_language::{
    detect_subtitle_language, external_display_label, language_label, normalize_metadata_language,
};
use crate::services::subtitle_match::{
    collect_subtitle_search_roots, fuzzy_stem_match, is_extended_subtitle_candidate,
    is_subtitle_candidate_near_video,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use crate::services::process_util::hidden_command;
use std::path::Path;

const SUBTITLE_EXTENSIONS: &[&str] = &[".srt", ".vtt", ".ass", ".ssa", ".sub"];

pub fn file_stem_str(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

fn is_language_token(token: &str) -> bool {
    let t = token.trim().to_lowercase();
    if t.is_empty() {
        return false;
    }
    if t.len() >= 2 && t.len() <= 3 && t.chars().all(|c| c.is_ascii_alphabetic()) {
        return true;
    }
    matches!(
        t.as_str(),
        "eng"
            | "english"
            | "rus"
            | "russian"
            | "jpn"
            | "japanese"
            | "deu"
            | "german"
            | "fra"
            | "fre"
            | "french"
            | "spa"
            | "spanish"
            | "kor"
            | "korean"
            | "zho"
            | "chi"
            | "chinese"
    )
}

/// Parse external subtitle filename relative to a video stem.
pub fn parse_external_subtitle_name(file_stem: &str, video_stem: &str) -> Option<(String, String)> {
    if file_stem == video_stem {
        return Some(("und".to_string(), "Original".to_string()));
    }
    let prefix = format!("{video_stem}.");
    if !file_stem.starts_with(&prefix) {
        return None;
    }
    let remainder = &file_stem[prefix.len()..];
    if remainder.is_empty() {
        return None;
    }
    let lang = if is_language_token(remainder) {
        normalize_metadata_language(remainder).code
    } else if let Some((lang_part, _rest)) = remainder.split_once('.') {
        if is_language_token(lang_part) {
            normalize_metadata_language(lang_part).code
        } else {
            return None;
        }
    } else {
        return None;
    };
    let label = format!("{} — {}", language_label(&lang), "external");
    Some((lang, label))
}

struct ScoredSubtitle {
    score: u32,
    entry: ExternalSubtitleIndexEntry,
}

pub fn discover_external_subtitles_for_video(
    video_path: &Path,
) -> (Vec<ExternalSubtitleIndexEntry>, SubtitleDiscoveryDebug) {
    let video_stem = file_stem_str(video_path);
    let search_roots = collect_subtitle_search_roots(video_path);
    let searched_dirs: Vec<String> = search_roots
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    let mut candidates: Vec<String> = Vec::new();
    let mut scored: Vec<ScoredSubtitle> = Vec::new();

    for root in &search_roots {
        let read_dir = match fs::read_dir(root) {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if !is_subtitle_extension(ext) {
                continue;
            }
            let format = SubtitleFormat::from_extension(ext).unwrap_or(SubtitleFormat::Srt);
            let stem = file_stem_str(&path);
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if !is_subtitle_candidate_near_video(&path, video_path)
                && !is_extended_subtitle_candidate(&path, video_path)
            {
                continue;
            }
            candidates.push(path.to_string_lossy().to_string());

            let mut score = fuzzy_stem_match(&video_stem, &stem);
            if parse_external_subtitle_name(&stem, &video_stem).is_some() {
                score = score.max(95);
            }

            let possible_match = score >= 60 && score < 95;
            if score >= 60 {
                let lang_info = detect_subtitle_language(&path);
                let mut label = external_display_label(&lang_info, &file_name);
                if possible_match {
                    label = format!("{label} (possible match)");
                }
                eprintln!(
                    "[Virelia subtitles] matched {} lang={} source={:?} confidence={:?}",
                    path.display(),
                    lang_info.code,
                    lang_info.source,
                    lang_info.confidence
                );
                scored.push(ScoredSubtitle {
                    score,
                    entry: ExternalSubtitleIndexEntry {
                        path: path.to_string_lossy().to_string(),
                        language: lang_info.code,
                        format,
                        label,
                    },
                });
            }
        }
    }

    scored.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.entry.path.cmp(&b.entry.path))
    });
    let mut entries = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();
    for item in scored {
        if item.score < 60 {
            continue;
        }
        if !seen_paths.insert(item.entry.path.clone()) {
            continue;
        }
        entries.push(item.entry);
    }

    eprintln!(
        "[Virelia subtitles] video={} dirs={} candidates={} matched={}",
        video_path.display(),
        searched_dirs.len(),
        candidates.len(),
        entries.len()
    );

    let debug = SubtitleDiscoveryDebug {
        video_path: video_path.to_string_lossy().to_string(),
        searched_dirs,
        candidates,
    };
    (entries, debug)
}

pub fn discover_external_subtitles_in_dir(video_path: &Path) -> Vec<ExternalSubtitleIndexEntry> {
    discover_external_subtitles_for_video(video_path).0
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    index: Option<u32>,
    codec_type: Option<String>,
    codec_name: Option<String>,
    tags: Option<HashMap<String, String>>,
    #[allow(dead_code)]
    disposition: Option<FfprobeDisposition>,
}

#[derive(Debug, Deserialize)]
struct FfprobeDisposition {
    #[allow(dead_code)]
    default: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    streams: Option<Vec<FfprobeStream>>,
}

pub fn probe_embedded_subtitles(video_path: &Path) -> Vec<(u32, String, String, SubtitleFormat)> {
    let paths = match locate_ffmpeg(None) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let output = hidden_command(&paths.ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-select_streams",
            "s",
            &video_path.to_string_lossy(),
        ])
        .output();
    let output = match output {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };
    let parsed: FfprobeOutput = match serde_json::from_slice(&output.stdout) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let streams = parsed.streams.unwrap_or_default();
    let mut tracks = Vec::new();
    for stream in streams {
        if stream.codec_type.as_deref() != Some("subtitle") {
            continue;
        }
        let index = stream.index.unwrap_or(0);
        let tags = stream.tags.unwrap_or_default();
        let lang_meta = tags
            .get("language")
            .map(|l| normalize_metadata_language(l))
            .unwrap_or_else(crate::services::subtitle_language::SubtitleLanguageResult::unknown);
        let lang = lang_meta.code.clone();
        let title = tags
            .get("title")
            .cloned()
            .unwrap_or_else(|| lang_meta.label.clone());
        let format = match stream.codec_name.as_deref() {
            Some("ass") | Some("ssa") => SubtitleFormat::Ass,
            Some("webvtt") | Some("vtt") => SubtitleFormat::Vtt,
            _ => SubtitleFormat::Srt,
        };
        tracks.push((index, lang, title, format));
    }
    tracks
}

fn track_id(video_key: &str, source: &str, lang: &str, suffix: &str) -> String {
    format!("{video_key}-{source}-{lang}-{suffix}")
}

fn video_key_for_path(video_path: &Path) -> String {
    media_id_for_path(video_path)
}

pub fn build_subtitle_tracks(
    video_id: &str,
    video_path: &Path,
    indexed_external: Option<&[ExternalSubtitleIndexEntry]>,
    generated_cache_dir: Option<&Path>,
) -> DiscoverSubtitlesResult {
    let mut tracks: Vec<SubtitleTrack> = Vec::new();
    let video_path_str = video_path.to_string_lossy().to_string();
    let video_key = video_key_for_path(video_path);

    let (mut external, debug) = discover_external_subtitles_for_video(video_path);
    let cache_dir_owned = generated_cache_dir.map(|p| p.to_path_buf());
    if let Some(indexed) = indexed_external {
        for entry in indexed {
            let entry_path = Path::new(&entry.path);
            let in_video_cache = cache_dir_owned
                .as_ref()
                .map(|cd| entry.path.starts_with(&cd.to_string_lossy().to_string()))
                .unwrap_or(false);
            if !in_video_cache
                && !is_subtitle_candidate_near_video(entry_path, video_path)
                && !is_extended_subtitle_candidate(entry_path, video_path)
            {
                continue;
            }
            if !external.iter().any(|e| e.path == entry.path) {
                external.push(entry.clone());
            }
        }
    }

    for (idx, entry) in external.iter().enumerate() {
        let lang = entry.language.clone();
        tracks.push(SubtitleTrack {
            id: track_id(&video_key, "external", &lang, &format!("ext-{idx}")),
            video_id: video_id.to_string(),
            video_path: video_path_str.clone(),
            video_key: video_key.clone(),
            source: SubtitleSource::External,
            language: lang.clone(),
            language_label: language_label(&lang),
            label: entry.label.clone(),
            format: entry.format,
            path: Some(entry.path.clone()),
            embedded_track_index: None,
            generated_at: None,
            confidence: None,
            is_default: None,
            generation_valid: None,
            generation_invalid_reason: None,
            generation_pipeline_version: None,
            is_partial: None,
            is_live_updating: None,
            generated_until_seconds: None,
            recovered_from_failure: None,
        });
    }

    for (stream_index, lang, title, subtitle_format) in probe_embedded_subtitles(video_path) {
        let label = format!("Embedded — {}", title);
        tracks.push(SubtitleTrack {
            id: track_id(
                &video_key,
                "embedded",
                &lang,
                &format!("emb-{stream_index}"),
            ),
            video_id: video_id.to_string(),
            video_path: video_path_str.clone(),
            video_key: video_key.clone(),
            source: SubtitleSource::Embedded,
            language: lang.clone(),
            language_label: language_label(&lang),
            label,
            format: subtitle_format,
            path: None,
            embedded_track_index: Some(stream_index),
            generated_at: None,
            confidence: None,
            is_default: None,
            generation_valid: None,
            generation_invalid_reason: None,
            generation_pipeline_version: None,
            is_partial: None,
            is_live_updating: None,
            generated_until_seconds: None,
            recovered_from_failure: None,
        });
    }

    if let Some(cache_dir) = generated_cache_dir {
        let generated =
            load_generated_tracks_from_cache(video_id, &video_path_str, &video_key, cache_dir);
        tracks.extend(generated);
    }

    DiscoverSubtitlesResult {
        tracks,
        debug: Some(debug),
    }
}

pub fn is_subtitle_extension(ext: &str) -> bool {
    let normalized = if ext.starts_with('.') {
        ext.to_lowercase()
    } else {
        format!(".{}", ext.to_lowercase())
    };
    SUBTITLE_EXTENSIONS.contains(&normalized.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_language_suffix() {
        let parsed = parse_external_subtitle_name("Movie.en", "Movie");
        assert!(parsed.is_some());
        let (lang, _) = parsed.unwrap();
        assert_eq!(lang, "en");
    }

    #[test]
    fn rejects_unrelated_basename() {
        assert!(parse_external_subtitle_name("Other.en", "Movie").is_none());
    }

    #[test]
    fn matches_exact_basename() {
        let parsed = parse_external_subtitle_name("Movie", "Movie");
        assert!(parsed.is_some());
    }
}
