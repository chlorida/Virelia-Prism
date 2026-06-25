use crate::services::subtitle_ass_writer::write_ass;
use crate::services::subtitle_cleanup::cleanup_transcription_cues;
use crate::services::subtitle_colors::{
    assign_subtitle_colors, ColorAssignmentContext, SpeakerColorMode,
};
use crate::services::subtitle_cue::{write_vtt, GeneratedSubtitleCue};
use crate::services::subtitle_cue_quality::{
    analyze_cues, compute_coverage_stats, filter_non_speech_cues, is_non_speech_cue,
    validate_generated_subtitles, CueQualityStats, GENERATION_PIPELINE_VERSION,
};
use crate::services::subtitle_franchise::{apply_legacy_glossary, detect_franchise};
use crate::services::subtitle_glossary::{
    count_suspicious_name_tokens, detect_glossary, NameStyle,
};
use crate::services::subtitle_language::detect_language_from_cue_texts;
use crate::services::subtitle_speaker::{collect_detected_speakers, enrich_cue_speakers};
use crate::services::subtitle_translation::{
    translate_cues_in_batches, translation_backend_available, validate_target_language_output,
    validate_translation_output, TranslationConfig, TranslationHostContext,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]

pub enum GenerationMethod {
    ExternalDirect,

    ExternalTranslate,

    AudioTranscribe,

    AudioTranscribeTranslate,
}

impl GenerationMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ExternalDirect => "external-direct",

            Self::ExternalTranslate => "external-translate",

            Self::AudioTranscribe => "audio-transcribe",

            Self::AudioTranscribeTranslate => "audio-transcribe-translate",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]

pub struct GeneratedSubtitleMetadata {
    pub video_path: String,

    pub video_key: String,

    pub target_language: String,

    pub source_language_mode: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub dominant_source_language: Option<String>,

    pub detected_source_languages: Vec<String>,

    pub mark_foreign_speech: bool,

    pub generated_at: i64,

    pub backend: String,

    pub model: String,

    pub is_translated: bool,

    pub pipeline_version: u32,

    pub generation_method: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub glossary_key: Option<String>,

    pub cue_count: usize,

    pub speech_cue_count: usize,

    pub non_speech_cue_count: usize,

    pub repeated_cue_count: usize,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub suspicious_name_count: Option<usize>,

    pub is_valid: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_source_language: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_subtitle_path: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation_backend: Option<String>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub speakers: Vec<String>,

    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub color_map: HashMap<String, String>,

    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub used_character_colors: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_duration_sec: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cue_duration_sec: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub coverage_ratio: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_cue_start_sec: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_cue_end_sec: Option<f64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub longest_gap_sec: Option<f64>,
}

pub fn detect_dominant_speech_language(segments: &[GeneratedSubtitleCue]) -> Option<String> {
    use std::collections::HashMap;

    let mut durations: HashMap<String, f64> = HashMap::new();

    for seg in segments {
        let lang = seg.source_language.as_deref().unwrap_or("").trim();

        if lang.is_empty() || lang == "und" || lang == "unknown" {
            continue;
        }

        let dur = (seg.end - seg.start).max(0.0);

        *durations.entry(lang.to_string()).or_insert(0.0) += dur;
    }

    if !durations.is_empty() {
        let total: f64 = durations.values().sum();

        let mut ranked: Vec<(String, f64)> = durations.into_iter().collect();

        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let (top_lang, top_dur) = &ranked[0];

        if ranked.len() == 1 || {
            let second = ranked[1].1;
            let top_ratio = top_dur / total;
            let second_ratio = second / total;
            !(second_ratio > 0.25 && top_ratio < 0.6) && !((top_ratio - second_ratio) < 0.15)
        } {
            return Some(top_lang.clone());
        }
    }

    detect_language_from_cue_texts(
        segments
            .iter()
            .filter(|seg| !is_non_speech_cue(&seg.text))
            .map(|seg| seg.text.as_str()),
    )
}

/// Translate whisper partial cues so live preview matches the target language (e.g. ja → ru).
pub fn translate_cues_for_partial_preview(
    cues: &mut Vec<GeneratedSubtitleCue>,
    video_path: &Path,
    target_language: &str,
    whisper_source: &str,
    detected_source: Option<&str>,
    use_whisper_translate: bool,
    translation_config: &TranslationConfig,
    translation_host: &TranslationHostContext,
    name_style: NameStyle,
) -> Result<(), String> {
    if use_whisper_translate || target_language.is_empty() {
        return Ok(());
    }

    let source_lang = detect_dominant_speech_language(cues)
        .or_else(|| detected_source.map(|s| s.to_string()))
        .or_else(|| {
            if whisper_source != "auto" && !whisper_source.is_empty() {
                Some(whisper_source.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "und".to_string());

    if source_lang == "und" || source_lang == target_language {
        return Ok(());
    }
    if !translation_host.backend_available(translation_config) {
        return Ok(());
    }

    let franchise = detect_franchise(video_path, None);
    translate_cues_in_batches(
        cues,
        &source_lang,
        target_language,
        translation_config,
        franchise.as_ref(),
        name_style,
        |_, _| {},
        Some(translation_host),
    )?;

    for cue in cues.iter_mut() {
        cue.text = apply_legacy_glossary(&cue.text, video_path, name_style);
    }
    Ok(())
}

pub fn foreign_speech_prefix(source_language: &str, target_language: &str) -> Option<String> {
    if source_language.is_empty() || source_language == "und" {
        return None;
    }

    let prefix = match (target_language, source_language) {
        ("ru", "fr") => "[по-французски] ",

        ("ru", "es") => "[по-испански] ",

        ("ru", "en") => "[по-английски] ",

        ("ru", "de") => "[по-немецки] ",

        ("ru", "ja") => "[по-японски] ",

        ("ru", "ko") => "[по-корейски] ",

        ("ru", "zh") => "[по-китайски] ",

        ("en", "fr") => "[in French] ",

        ("en", "es") => "[in Spanish] ",

        ("en", "de") => "[in German] ",

        ("en", "ja") => "[in Japanese] ",

        ("en", "ko") => "[in Korean] ",

        ("en", "zh") => "[in Chinese] ",

        ("en", "ru") => "[in Russian] ",

        _ if target_language != source_language => {
            if target_language == "ru" {
                "[на другом языке] "
            } else {
                "[in another language] "
            }
        }

        _ => return None,
    };

    Some(prefix.to_string())
}

pub fn apply_foreign_speech_markers(
    cues: &mut [GeneratedSubtitleCue],

    dominant: Option<&str>,

    target_language: &str,

    enabled: bool,
) {
    if !enabled {
        return;
    }

    let Some(dominant_lang) = dominant else {
        return;
    };

    for cue in cues.iter_mut() {
        let src = cue.source_language.as_deref().unwrap_or(dominant_lang);

        if src == dominant_lang || src == "und" {
            continue;
        }

        if let Some(prefix) = foreign_speech_prefix(src, target_language) {
            if !cue.text.starts_with(&prefix) {
                cue.text = format!("{prefix}{}", cue.text);
            }
        }
    }
}

pub struct PipelineResult {
    pub metadata: GeneratedSubtitleMetadata,

    pub vtt: String,
}

pub struct FinalizeOptions<'a> {
    pub video_path: &'a Path,

    pub video_key: &'a str,

    pub target_language: &'a str,

    pub source_language_mode: &'a str,

    pub detected_source_language: Option<String>,

    pub mark_foreign_speech: bool,

    pub show_sound_labels: bool,

    pub name_style: NameStyle,

    pub model: &'a str,

    pub backend: &'a str,

    pub generation_method: GenerationMethod,

    pub source_subtitle_path: Option<String>,

    pub run_cleanup: bool,

    pub translation_config: &'a TranslationConfig,

    pub app_data: Option<&'a Path>,

    pub franchise_key: Option<&'a str>,

    pub speaker_color_mode: SpeakerColorMode,

    #[allow(dead_code)]
    pub preserve_honorifics: bool,

    pub video_type_review: bool,

    pub output_format: &'a str,

    pub video_duration_sec: Option<f64>,

    pub translation_already_applied: bool,

    pub translation_host: Option<TranslationHostContext>,
}

pub fn finalize_generated_subtitles(
    mut cues: Vec<GeneratedSubtitleCue>,

    options: FinalizeOptions<'_>,
) -> Result<PipelineResult, String> {
    let FinalizeOptions {
        video_path,

        video_key,

        target_language,

        source_language_mode,

        detected_source_language,

        mark_foreign_speech,

        show_sound_labels,

        name_style,

        model,

        backend,

        generation_method,

        source_subtitle_path,

        run_cleanup,

        translation_config,

        app_data,

        franchise_key,

        speaker_color_mode,

        preserve_honorifics: _,

        video_type_review,

        output_format,

        video_duration_sec,

        translation_already_applied,
        ..
    } = options;

    let translation_host = options.translation_host.as_ref();

    let legacy_glossary = detect_glossary(video_path);

    let glossary_key = franchise_key
        .map(str::to_string)
        .or_else(|| legacy_glossary.map(|g| g.series_key.to_string()));

    let franchise = detect_franchise(video_path, franchise_key);

    enrich_cue_speakers(&mut cues, franchise.as_ref());

    let detected_langs: Vec<String> = detected_source_language
        .clone()
        .map(|l| vec![l.clone()])
        .unwrap_or_default();

    for cue in cues.iter_mut() {
        cue.target_language = target_language.to_string();

        if cue.source_language.is_none() {
            cue.source_language = detected_source_language.clone();
        }

        if cue.source_text.is_none() {
            cue.source_text = Some(cue.text.clone());
        }
    }

    if run_cleanup {
        cleanup_transcription_cues(&mut cues, video_path, name_style);
    }

    let dominant = detect_dominant_speech_language(&cues).or(detected_source_language.clone());

    let text_lang = detect_language_from_cue_texts(
        cues
            .iter()
            .filter(|cue| !is_non_speech_cue(&cue.text))
            .map(|cue| cue.text.as_str()),
    );

    let source_lang = dominant
        .as_deref()
        .or(detected_source_language.as_deref())
        .or(text_lang.as_deref())
        .unwrap_or("und");

    let needs_translation = !translation_already_applied
        && source_lang != "und"
        && source_lang != target_language
        && !target_language.is_empty();

    if needs_translation {
        if translation_host
            .as_ref()
            .map(|h| h.backend_available(translation_config))
            .unwrap_or_else(|| translation_backend_available(translation_config))
        {
            // available
        } else {
            return Err("unavailable_no_translation".to_string());
        }

        translate_cues_in_batches(
            &mut cues,
            source_lang,
            target_language,
            translation_config,
            franchise.as_ref(),
            name_style,
            |_, _| {},
            translation_host,
        )?;

        for cue in cues.iter_mut() {
            cue.text = apply_legacy_glossary(&cue.text, video_path, name_style);
        }

        let source_speech_count = cues
            .iter()
            .filter(|c| !crate::services::subtitle_cue_quality::is_non_speech_cue(&c.text))
            .count();

        validate_translation_output(&cues, Some(source_speech_count))?;
    } else if translation_already_applied {
        for cue in cues.iter_mut() {
            cue.text = apply_legacy_glossary(&cue.text, video_path, name_style);
        }

        let source_speech_count = cues
            .iter()
            .filter(|c| !crate::services::subtitle_cue_quality::is_non_speech_cue(&c.text))
            .count();

        validate_translation_output(&cues, Some(source_speech_count))?;
    } else {
        if let Some(inferred) = detect_dominant_speech_language(&cues) {
            if inferred != target_language
                && inferred != "und"
                && !target_language.is_empty()
                && !translation_already_applied
            {
                if translation_host
                    .as_ref()
                    .map(|h| h.backend_available(translation_config))
                    .unwrap_or_else(|| translation_backend_available(translation_config))
                {
                    // available
                } else {
                    return Err("unavailable_no_translation".to_string());
                }
            }
        }

        for cue in cues.iter_mut() {
            cue.text = cue.source_text.clone().unwrap_or_else(|| cue.text.clone());

            cue.is_translated = false;
        }
    }

    apply_foreign_speech_markers(
        &mut cues,
        dominant.as_deref(),
        target_language,
        mark_foreign_speech,
    );

    let mut color_map_simple = HashMap::new();

    let used_character_colors = if let Some(app_data_path) = app_data {
        let assigned = assign_subtitle_colors(
            &mut cues,
            &ColorAssignmentContext {
                franchise: franchise.as_ref(),

                franchise_key,

                video_key,

                video_path: Some(video_path),

                app_data: app_data_path,

                mode: speaker_color_mode,

                video_type_review,
            },
        );

        for (speaker, entry) in &assigned {
            color_map_simple.insert(speaker.clone(), entry.color.clone());
        }

        !assigned.is_empty()
    } else {
        false
    };

    filter_non_speech_cues(&mut cues, show_sound_labels);

    if target_language == "ru" {
        validate_target_language_output(&cues, target_language)?;
    }

    let quality = validate_generated_subtitles(&cues, video_duration_sec, None)?;

    let mut stats: CueQualityStats = analyze_cues(&cues);

    stats.repeated_cue_count = quality.repeated_cue_count;

    let coverage = video_duration_sec.map(|duration| compute_coverage_stats(&cues, duration));

    let suspicious_name_count = legacy_glossary.map(|g| {
        cues.iter()
            .map(|c| count_suspicious_name_tokens(&c.text, g))
            .sum::<usize>()
    });

    let metadata = GeneratedSubtitleMetadata {
        video_path: video_path.to_string_lossy().to_string(),

        video_key: video_key.to_string(),

        target_language: target_language.to_string(),

        source_language_mode: source_language_mode.to_string(),

        dominant_source_language: dominant,

        detected_source_languages: detected_langs,

        mark_foreign_speech,

        generated_at: chrono::Utc::now().timestamp(),

        backend: backend.to_string(),

        model: model.to_string(),

        is_translated: needs_translation || translation_already_applied,

        pipeline_version: GENERATION_PIPELINE_VERSION,

        generation_method: generation_method.as_str().to_string(),

        glossary_key,

        cue_count: stats.cue_count,

        speech_cue_count: stats.speech_cue_count,

        non_speech_cue_count: stats.non_speech_cue_count,

        repeated_cue_count: stats.repeated_cue_count,

        suspicious_name_count,

        is_valid: true,

        invalid_reason: None,

        detected_source_language: detected_source_language.clone(),

        source_subtitle_path,

        translation_backend: Some(translation_config.backend.as_str().to_string()),

        speakers: collect_detected_speakers(&cues),

        color_map: color_map_simple,

        used_character_colors,

        video_duration_sec,

        total_cue_duration_sec: coverage.as_ref().map(|c| c.total_cue_duration),

        coverage_ratio: coverage.as_ref().map(|c| c.coverage_ratio),

        first_cue_start_sec: coverage.as_ref().and_then(|c| c.first_cue_start),

        last_cue_end_sec: coverage.as_ref().and_then(|c| c.last_cue_end),

        longest_gap_sec: coverage.as_ref().and_then(|c| c.longest_gap),
    };

    let vtt = if output_format == "ass" {
        write_ass(&cues, "Virelia Prism Generated Subtitles")
    } else {
        write_vtt(&cues)
    };

    Ok(PipelineResult {
        vtt,

        metadata,
    })
}

pub fn parse_whisper_detected_language(stderr: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(stderr).to_lowercase();

    for line in text.lines() {
        let trimmed = line.trim();

        for prefix in ["auto-detected language:", "detected language:", "language:"] {
            if let Some(rest) = trimmed.strip_prefix(prefix) {
                if let Some(lang) = extract_whisper_language_token(rest) {
                    return Some(lang);
                }
            }
        }

        if let Some(lang) = extract_whisper_language_assignment(trimmed) {
            return Some(lang);
        }
    }

    None
}

fn extract_whisper_language_token(rest: &str) -> Option<String> {
    let lang = rest
        .trim()
        .split_whitespace()
        .next()?
        .trim_matches(|c: char| c == ',' || c == '.' || c == ')');

    if lang.is_empty() || lang == "auto" {
        return None;
    }

    Some(normalize_lang_code(lang))
}

fn extract_whisper_language_assignment(line: &str) -> Option<String> {
    let markers = ["language =", "language=", "lang =", "lang="];
    for marker in markers {
        if let Some(rest) = line.split(marker).nth(1) {
            if let Some(lang) = extract_whisper_language_token(rest) {
                return Some(lang);
            }
        }
    }
    None
}

#[cfg(test)]

mod tests {

    use super::*;

    fn test_translation_config() -> TranslationConfig {
        TranslationConfig::default()
    }

    fn test_finalize_options<'a>(
        video_path: &'a Path,

        target_language: &'a str,

        detected_source_language: Option<String>,

        generation_method: GenerationMethod,

        translation_config: &'a TranslationConfig,
    ) -> FinalizeOptions<'a> {
        FinalizeOptions {
            video_path,

            video_key: "key1",

            target_language,

            source_language_mode: "auto",

            detected_source_language,

            mark_foreign_speech: true,

            show_sound_labels: false,

            name_style: NameStyle::Romanized,

            model: "base",

            backend: "external",

            generation_method,

            source_subtitle_path: None,

            run_cleanup: false,

            translation_config,

            app_data: None,

            franchise_key: None,

            speaker_color_mode: SpeakerColorMode::Auto,

            preserve_honorifics: true,

            video_type_review: false,

            output_format: "vtt",

            video_duration_sec: None,

            translation_already_applied: false,

            translation_host: None,
        }
    }

    fn cue(start: f64, end: f64, lang: &str) -> GeneratedSubtitleCue {
        GeneratedSubtitleCue {
            start,

            end,

            text: "x".into(),

            source_text: Some("x".into()),

            source_language: Some(lang.into()),

            ..Default::default()
        }
    }

    #[test]

    fn dominant_language_by_duration() {
        let segments = vec![
            cue(0.0, 10.0, "ja"),
            cue(10.0, 12.0, "fr"),
            cue(12.0, 30.0, "ja"),
        ];

        assert_eq!(
            detect_dominant_speech_language(&segments).as_deref(),
            Some("ja")
        );
    }

    #[test]

    fn finalize_same_language_skips_translation() {
        let cues = vec![
            GeneratedSubtitleCue {
                start: 0.0,
                end: 1.0,
                text: "Привет".into(),
                source_text: Some("Привет".into()),
                source_language: Some("ru".into()),
                ..Default::default()
            },
            GeneratedSubtitleCue {
                start: 1.2,
                end: 2.2,
                text: "Как дела?".into(),
                source_text: Some("Как дела?".into()),
                source_language: Some("ru".into()),
                ..Default::default()
            },
        ];

        let translation_config = test_translation_config();

        let result = finalize_generated_subtitles(
            cues,
            test_finalize_options(
                Path::new("/v.mkv"),
                "ru",
                Some("ru".into()),
                GenerationMethod::ExternalDirect,
                &translation_config,
            ),
        )
        .unwrap();

        assert!(!result.metadata.is_translated);

        assert_eq!(result.metadata.generation_method, "external-direct");

        assert!(result.vtt.contains("Привет"));
    }

    #[test]

    fn finalize_requires_translation_backend() {
        let cues = vec![GeneratedSubtitleCue {
            start: 0.0,

            end: 1.0,

            text: "こんにちは".into(),

            source_text: Some("こんにちは".into()),

            source_language: Some("ja".into()),

            ..Default::default()
        }];

        let translation_config = test_translation_config();

        let result = finalize_generated_subtitles(
            cues,
            test_finalize_options(
                Path::new("/v.mkv"),
                "ru",
                Some("ja".into()),
                GenerationMethod::AudioTranscribeTranslate,
                &translation_config,
            ),
        );

        assert!(matches!(result, Err(ref e) if e == "unavailable_no_translation"));
    }

    #[test]
    fn dominant_language_from_japanese_text_without_metadata() {
        let segments = vec![GeneratedSubtitleCue {
            start: 0.0,
            end: 2.0,
            text: "こんにちは、今日はいい天気ですね。".into(),
            source_text: Some("こんにちは、今日はいい天気ですね。".into()),
            ..Default::default()
        }];
        assert_eq!(
            detect_dominant_speech_language(&segments).as_deref(),
            Some("ja")
        );
    }

    #[test]
    fn finalize_translates_whisper_cues_when_language_undetected() {
        use crate::services::subtitle_translation::{TranslationBackendKind, TranslationConfig};

        let cues = vec![
            GeneratedSubtitleCue {
                start: 0.0,
                end: 1.0,
                text: "こんにちは、元気ですか。".into(),
                source_text: Some("こんにちは、元気ですか。".into()),
                ..Default::default()
            },
            GeneratedSubtitleCue {
                start: 1.2,
                end: 2.4,
                text: "今日はいい天気ですね。".into(),
                source_text: Some("今日はいい天気ですね。".into()),
                ..Default::default()
            },
        ];

        let translation_config = TranslationConfig {
            backend: TranslationBackendKind::Mock,
            ..Default::default()
        };

        let result = finalize_generated_subtitles(
            cues,
            test_finalize_options(
                Path::new("/v.mkv"),
                "ru",
                None,
                GenerationMethod::AudioTranscribeTranslate,
                &translation_config,
            ),
        )
        .unwrap();

        assert!(result.metadata.is_translated);
        assert!(result.vtt.contains("Перевод"));
    }

    #[test]
    fn parse_whisper_language_assignment_line() {
        let stderr = b"whisper_full: language = ja (p = 0.98)\n";
        assert_eq!(parse_whisper_detected_language(stderr).as_deref(), Some("ja"));
    }
}

fn normalize_lang_code(raw: &str) -> String {
    match raw {
        "english" | "eng" => "en".to_string(),

        "russian" | "rus" => "ru".to_string(),

        "japanese" | "jpn" => "ja".to_string(),

        "german" | "deu" | "ger" => "de".to_string(),

        "french" | "fra" | "fre" => "fr".to_string(),

        "spanish" | "spa" => "es".to_string(),

        "korean" | "kor" => "ko".to_string(),

        "chinese" | "zho" | "chi" => "zh".to_string(),

        other => other.chars().take(3).collect(),
    }
}
