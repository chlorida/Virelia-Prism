use crate::models::{SubtitleFormat, TranslateSubtitlesRequest, TranslateSubtitlesResponse};
use crate::services::scanner::media_id_for_path;
use crate::services::subtitle_ass_parser::{parse_ass_cues, subtitle_cues_to_generated};
use crate::services::subtitle_ass_writer::write_ass;
use crate::services::subtitle_colors::{
    assign_subtitle_colors, ColorAssignmentContext, SpeakerColorMode,
};
use crate::services::subtitle_cue::{parse_subtitle_file_cues, write_vtt, GeneratedSubtitleCue};
use crate::services::subtitle_external_source::{
    convert_external_file_to_parseable, find_best_external_source,
};
use crate::services::subtitle_franchise::{apply_legacy_glossary, detect_franchise};
use crate::services::subtitle_generation_pipeline::{
    apply_foreign_speech_markers, detect_dominant_speech_language,
};
use crate::services::subtitle_glossary::NameStyle;
use crate::services::subtitle_speaker::{collect_detected_speakers, enrich_cue_speakers};
use crate::services::subtitle_translation::{
    apply_translation_results, build_translation_batch_request, create_backend,
    validate_translation_output, TranslationConfig, TranslationContext, TranslationHostContext,
};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn translate_subtitles(
    app: &AppHandle,
    app_data: &Path,
    ffmpeg: &Path,
    video_path: &Path,
    request: &TranslateSubtitlesRequest,
    translation_config: &TranslationConfig,
) -> TranslateSubtitlesResponse {
    let video_key = media_id_for_path(video_path);
    let target_language = request.target_language.clone();
    let resource_dir = app.path().resource_dir().ok();
    let translation_host = TranslationHostContext::from_app(app, resource_dir.as_deref(), app_data);
    let cache_dir = app_data.join("subtitles").join(&video_key);
    if let Err(e) = std::fs::create_dir_all(&cache_dir) {
        return failed_response(&target_language, format!("Failed to create cache dir: {e}"));
    }

    let source_path = resolve_source_path(video_path, request);
    let Some(source_path) = source_path else {
        return failed_response(&target_language, "Source subtitle file not found.".into());
    };

    let format = detect_format(&source_path);
    let cues = match load_source_cues(ffmpeg, &source_path, format, &cache_dir) {
        Ok(c) if !c.is_empty() => c,
        Ok(_) => {
            return failed_response(&target_language, "Source subtitles contain no cues.".into())
        }
        Err(e) => return failed_response(&target_language, e),
    };

    let detected_source = resolve_source_language(&cues, &request.source_language);
    if detected_source == target_language {
        return TranslateSubtitlesResponse {
            status: "ok".into(),
            output_path: Some(source_path.to_string_lossy().to_string()),
            track_id: Some(format!("{video_key}-external-direct")),
            target_language: target_language.clone(),
            source_language: Some(detected_source),
            cue_count: cues.len(),
            translated_cue_count: 0,
            detected_speakers: Some(collect_detected_speakers(&cues)),
            used_glossary: request.franchise_key.clone(),
            used_character_colors: false,
            error: None,
        };
    }

    if !translation_host.backend_available(translation_config) {
        return failed_response(&target_language, "unavailable_no_translation".into());
    }

    let franchise = detect_franchise(video_path, request.franchise_key.as_deref());
    let name_style = if request.preserve_honorifics.unwrap_or(true) {
        NameStyle::Romanized
    } else {
        NameStyle::Romanized
    };
    let mut working = cues;
    enrich_cue_speakers(&mut working, franchise.as_ref());

    let backend = match create_backend(translation_config, Some(&translation_host)) {
        Ok(b) => b,
        Err(e) => return failed_response(&target_language, e),
    };
    let glossary_payload = franchise
        .as_ref()
        .map(|g| g.to_translation_glossary(&target_language));
    let batch = build_translation_batch_request(
        &working,
        &detected_source,
        &target_language,
        glossary_payload,
        Some(TranslationContext {
            preserve_honorifics: request.preserve_honorifics.unwrap_or(true),
            target_language: target_language.clone(),
            name_style: "localized".into(),
        }),
    );
    let translated = match backend.translate_batch(&batch) {
        Ok(r) => r,
        Err(e) => return failed_response(&target_language, e),
    };
    apply_translation_results(
        &mut working,
        &translated,
        franchise.as_ref(),
        name_style,
        &target_language,
    );

    for cue in working.iter_mut() {
        cue.text = apply_legacy_glossary(&cue.text, video_path, name_style);
    }

    let dominant = detect_dominant_speech_language(&working).or(Some(detected_source.clone()));
    apply_foreign_speech_markers(
        &mut working,
        dominant.as_deref(),
        &target_language,
        request.mark_foreign_speech.unwrap_or(true),
    );

    let source_speech_count = working
        .iter()
        .filter(|c| !crate::services::subtitle_cue_quality::is_non_speech_cue(&c.text))
        .count();
    if let Err(e) = validate_translation_output(&working, Some(source_speech_count)) {
        return failed_response(&target_language, e);
    }

    let color_mode =
        SpeakerColorMode::from_str(request.speaker_color_mode.as_deref().unwrap_or("auto"));
    let color_map = assign_subtitle_colors(
        &mut working,
        &ColorAssignmentContext {
            franchise: franchise.as_ref(),
            franchise_key: request.franchise_key.as_deref(),
            video_key: &video_key,
            video_path: Some(video_path),
            app_data,
            mode: color_mode,
            video_type_review: is_review_video(video_path),
        },
    );

    let output_format = request.output_format.as_deref().unwrap_or("ass");
    let (output_path, body) = match output_format {
        "vtt" => {
            let path = cache_dir.join(format!("translated.{target_language}.vtt"));
            let body = write_vtt(&working);
            (path, body)
        }
        _ => {
            let path = cache_dir.join(format!("translated.{target_language}.ass"));
            let body = write_ass(&working, "Virelia Prism Translated Subtitles");
            (path, body)
        }
    };

    if let Err(e) = std::fs::write(&output_path, body) {
        return failed_response(
            &target_language,
            format!("Failed to save translated subtitles: {e}"),
        );
    }

    let metadata = build_translation_metadata(
        video_path,
        &video_key,
        &source_path,
        &detected_source,
        &target_language,
        translation_config,
        request,
        &working,
        &color_map,
    );
    let meta_path = cache_dir.join(format!("translated.{target_language}.metadata.json"));
    if let Ok(json) = serde_json::to_string_pretty(&metadata) {
        let _ = std::fs::write(meta_path, json);
    }

    let translated_count = working.iter().filter(|c| c.is_translated).count();
    TranslateSubtitlesResponse {
        status: "ok".into(),
        output_path: Some(output_path.to_string_lossy().to_string()),
        track_id: Some(format!("{video_key}-translated-{target_language}")),
        target_language,
        source_language: Some(detected_source),
        cue_count: working.len(),
        translated_cue_count: translated_count,
        detected_speakers: Some(collect_detected_speakers(&working)),
        used_glossary: franchise.map(|g| g.franchise_key),
        used_character_colors: !color_map.is_empty(),
        error: None,
    }
}

fn failed_response(target_language: &str, error: String) -> TranslateSubtitlesResponse {
    TranslateSubtitlesResponse {
        status: "failed".into(),
        output_path: None,
        track_id: None,
        target_language: target_language.to_string(),
        source_language: None,
        cue_count: 0,
        translated_cue_count: 0,
        detected_speakers: None,
        used_glossary: None,
        used_character_colors: false,
        error: Some(error),
    }
}

fn resolve_source_path(video_path: &Path, request: &TranslateSubtitlesRequest) -> Option<PathBuf> {
    if let Some(path) = request.source_subtitle_path.as_ref() {
        let p = PathBuf::from(path);
        if p.is_file() {
            return Some(p);
        }
    }
    find_best_external_source(video_path, &request.target_language).map(|s| s.path)
}

fn detect_format(path: &Path) -> SubtitleFormat {
    SubtitleFormat::from_extension(path.extension().and_then(|e| e.to_str()).unwrap_or("ass"))
        .unwrap_or(crate::models::SubtitleFormat::Ass)
}

fn load_source_cues(
    ffmpeg: &Path,
    source_path: &Path,
    format: SubtitleFormat,
    cache_dir: &Path,
) -> Result<Vec<GeneratedSubtitleCue>, String> {
    match format {
        SubtitleFormat::Ass | SubtitleFormat::Ssa => {
            let raw = std::fs::read_to_string(source_path).map_err(|e| e.to_string())?;
            let ass_cues = parse_ass_cues(&raw);
            Ok(subtitle_cues_to_generated(&ass_cues, None))
        }
        _ => {
            let (parse_path, parse_format) =
                convert_external_file_to_parseable(ffmpeg, source_path, format, cache_dir)?;
            let raw = std::fs::read_to_string(&parse_path).map_err(|e| e.to_string())?;
            Ok(parse_subtitle_file_cues(&raw, parse_format))
        }
    }
}

fn resolve_source_language(cues: &[GeneratedSubtitleCue], source_language: &str) -> String {
    if source_language != "auto" && !source_language.is_empty() {
        return source_language.to_string();
    }
    detect_dominant_speech_language(cues)
        .or_else(|| cues.first().and_then(|c| c.source_language.clone()))
        .unwrap_or_else(|| "und".to_string())
}

fn is_review_video(video_path: &Path) -> bool {
    let lower = video_path.to_string_lossy().to_lowercase();
    lower.contains("review") || lower.contains("essay") || lower.contains("обзор")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationSidecarMetadata {
    video_path: String,
    video_key: String,
    source_subtitle_path: String,
    source_language: String,
    target_language: String,
    method: String,
    translation_backend: String,
    franchise_key: Option<String>,
    glossary_version: u32,
    speaker_color_mode: String,
    cue_count: usize,
    translated_cue_count: usize,
    speakers: Vec<String>,
    color_map: std::collections::HashMap<String, crate::services::subtitle_colors::ColorMapEntry>,
    created_at: i64,
    status: String,
}

fn build_translation_metadata(
    video_path: &Path,
    video_key: &str,
    source_path: &Path,
    source_language: &str,
    target_language: &str,
    config: &TranslationConfig,
    request: &TranslateSubtitlesRequest,
    cues: &[GeneratedSubtitleCue],
    color_map: &std::collections::HashMap<String, crate::services::subtitle_colors::ColorMapEntry>,
) -> TranslationSidecarMetadata {
    TranslationSidecarMetadata {
        video_path: video_path.to_string_lossy().to_string(),
        video_key: video_key.to_string(),
        source_subtitle_path: source_path.to_string_lossy().to_string(),
        source_language: source_language.to_string(),
        target_language: target_language.to_string(),
        method: "external-subtitle-translation".into(),
        translation_backend: config.backend.as_str().into(),
        franchise_key: request.franchise_key.clone(),
        glossary_version: 1,
        speaker_color_mode: request
            .speaker_color_mode
            .clone()
            .unwrap_or_else(|| "auto".into()),
        cue_count: cues.len(),
        translated_cue_count: cues.iter().filter(|c| c.is_translated).count(),
        speakers: collect_detected_speakers(cues),
        color_map: color_map.clone(),
        created_at: chrono::Utc::now().timestamp(),
        status: "valid".into(),
    }
}
