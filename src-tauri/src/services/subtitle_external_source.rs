use crate::models::{ExternalSubtitleIndexEntry, SubtitleFormat};
use crate::services::subtitle_ass_parser::{parse_ass_cues, subtitle_cues_to_generated};
use crate::services::subtitle_cue::{parse_subtitle_file_cues, GeneratedSubtitleCue};
use crate::services::subtitle_discovery::discover_external_subtitles_for_video;
use crate::services::subtitle_language::{detect_from_content, normalize_metadata_language};
use crate::services::process_util::hidden_command;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExternalSourceKind {
    /// Subtitle language already matches target — reuse timings/text.
    Direct,
    /// Subtitle language differs — requires translation backend.
    Translate,
}

#[derive(Debug, Clone)]
pub struct ExternalSubtitleSource {
    pub path: PathBuf,
    pub language: String,
    pub format: SubtitleFormat,
    pub kind: ExternalSourceKind,
    #[allow(dead_code)]
    pub label: String,
}

fn language_matches(a: &str, b: &str) -> bool {
    let a = normalize_metadata_language(a.split('-').next().unwrap_or(a)).code;
    let b = normalize_metadata_language(b.split('-').next().unwrap_or(b)).code;
    a == b && a != "und"
}

fn score_external_candidate(language: &str, target_language: &str) -> i32 {
    if language_matches(language, target_language) {
        return 1000;
    }
    if language == "und" || language.is_empty() {
        return 0;
    }
    // For Russian targets, prefer English sources over Japanese when translating.
    if target_language == "ru" {
        return match language {
            "en" => 550,
            "ja" => 500,
            "ru" => 350,
            _ => 200,
        };
    }
    match language {
        "ja" => 500,
        "en" => 400,
        "ru" => 350,
        _ => 200,
    }
}

fn external_label_matches_content(path: &Path, language: &str) -> bool {
    let Some(content) = detect_from_content(path) else {
        return true;
    };
    language_matches(&content.code, language)
}

pub fn find_best_external_source(
    video_path: &Path,
    target_language: &str,
) -> Option<ExternalSubtitleSource> {
    let (external, _) = discover_external_subtitles_for_video(video_path);
    pick_best_from_entries(&external, target_language)
}

pub fn pick_best_from_entries(
    entries: &[ExternalSubtitleIndexEntry],
    target_language: &str,
) -> Option<ExternalSubtitleSource> {
    let mut ranked: Vec<(&ExternalSubtitleIndexEntry, i32)> = entries
        .iter()
        .map(|entry| {
            (
                entry,
                score_external_candidate(&entry.language, target_language),
            )
        })
        .filter(|(_, score)| *score > 0)
        .collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    let (entry, _) = ranked.first()?;
    let kind = if language_matches(&entry.language, target_language) {
        let path = Path::new(&entry.path);
        if external_label_matches_content(path, &entry.language) {
            ExternalSourceKind::Direct
        } else {
            ExternalSourceKind::Translate
        }
    } else {
        ExternalSourceKind::Translate
    };
    Some(ExternalSubtitleSource {
        path: PathBuf::from(&entry.path),
        language: entry.language.clone(),
        format: entry.format,
        kind,
        label: entry.label.clone(),
    })
}

pub fn convert_external_file_to_parseable(
    ffmpeg: &Path,
    source: &Path,
    format: SubtitleFormat,
    cache_dir: &Path,
) -> Result<(PathBuf, &'static str), String> {
    match format {
        SubtitleFormat::Vtt => Ok((source.to_path_buf(), "vtt")),
        SubtitleFormat::Srt => Ok((source.to_path_buf(), "srt")),
        SubtitleFormat::Ass | SubtitleFormat::Ssa => {
            let out = cache_dir.join("external-source.vtt");
            let output = hidden_command(ffmpeg)
                .args(["-y", "-i"])
                .arg(source)
                .args(["-f", "webvtt"])
                .arg(&out)
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() || !out.exists() {
                return Err("Failed to convert external ASS/SSA subtitles.".to_string());
            }
            Ok((out, "vtt"))
        }
    }
}

pub fn load_external_cues(
    ffmpeg: &Path,
    source: &ExternalSubtitleSource,
    cache_dir: &Path,
) -> Result<Vec<GeneratedSubtitleCue>, String> {
    if !source.path.exists() {
        return Err("External subtitle file not found.".to_string());
    }
    let cues = match source.format {
        SubtitleFormat::Ass | SubtitleFormat::Ssa => {
            let raw = std::fs::read_to_string(&source.path).map_err(|e| e.to_string())?;
            subtitle_cues_to_generated(&parse_ass_cues(&raw), Some(source.language.clone()))
        }
        _ => {
            let (parse_path, format) =
                convert_external_file_to_parseable(ffmpeg, &source.path, source.format, cache_dir)?;
            let raw = std::fs::read_to_string(&parse_path).map_err(|e| e.to_string())?;
            let mut parsed = parse_subtitle_file_cues(&raw, format);
            for cue in parsed.iter_mut() {
                cue.source_language = Some(source.language.clone());
            }
            parsed
        }
    };
    if cues.is_empty() {
        return Err("External subtitle file contains no cues.".to_string());
    }
    Ok(cues)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_target_language_external() {
        let entries = vec![
            ExternalSubtitleIndexEntry {
                path: "/a.en.ass".into(),
                language: "en".into(),
                format: SubtitleFormat::Ass,
                label: "English".into(),
            },
            ExternalSubtitleIndexEntry {
                path: "/a.ru.ass".into(),
                language: "ru".into(),
                format: SubtitleFormat::Ass,
                label: "Russian".into(),
            },
        ];
        let picked = pick_best_from_entries(&entries, "ru").unwrap();
        assert_eq!(picked.language, "ru");
        assert_eq!(picked.kind, ExternalSourceKind::Direct);
    }

    #[test]
    fn marks_cross_language_as_translate() {
        let entries = vec![ExternalSubtitleIndexEntry {
            path: "/a.en.ass".into(),
            language: "en".into(),
            format: SubtitleFormat::Ass,
            label: "English".into(),
        }];
        let picked = pick_best_from_entries(&entries, "ru").unwrap();
        assert_eq!(picked.kind, ExternalSourceKind::Translate);
    }
}
