use crate::models::{
    DiscoverSubtitlesResult, ExternalSubtitleIndexEntry, SubtitleFormat,
    SubtitleGenerationAvailability, SubtitleSource, SubtitleTrack, VideoAudioStream,
};
use crate::models::{
    GetCharacterColorRequest, GetCharacterColorResponse, ResetCharacterColorRequest,
    SetCharacterColorOverrideRequest, SetCharacterColorOverrideResponse,
    TranslateExistingSubtitlesRequest, TranslateSubtitlesRequest, TranslateSubtitlesResponse,
};
use crate::services::ffmpeg_util::{ffmpeg_status, locate_ffmpeg, FfmpegStatus};
use crate::services::subtitle_cache::{
    clear_all_generated_cache, clear_video_cache, extract_embedded_to_cache,
    resolve_video_cache_dir,
};
use crate::services::subtitle_color_intelligence::{
    infer_character_color_api, reset_character_color_override as reset_color_override_svc,
    set_character_color_override as set_color_override_svc, InferCharacterColorRequest,
    InferColorSpeakerContext,
};
use crate::services::subtitle_discovery::build_subtitle_tracks;
use crate::services::subtitle_generation::{
    generate_subtitles_background, list_installed_whisper_models_with_app_data,
    list_video_audio_streams, locate_whisper_cli_for_generation, locate_whisper_model_with_app_data,
    probe_whisper_gpu_for_cli, translate_existing_subtitles_background, whisper_model_hint,
    GenerationMode, GenerationRegistry,
};
use crate::services::whisper_runtime::load_whisper_gpu_config;
use crate::services::subtitle_glossary::NameStyle;
use crate::services::subtitle_language::{detect_subtitle_language, language_label};
use crate::services::subtitle_translate::translate_subtitles;
use crate::services::subtitle_translation::{
    load_translation_config, translation_backend_available_at,
};
use crate::settings;
use crate::state::subtitle_index::{app_data_dir, SubtitleIndexStore};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

fn resource_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok()
}

#[tauri::command]
pub fn read_subtitle_file(path: String) -> Result<String, String> {
    let file = PathBuf::from(&path);
    if !file.is_file() {
        return Err(format!("subtitle file not found: {path}"));
    }
    fs::read_to_string(&file).map_err(|e| format!("failed to read subtitle file: {e}"))
}

#[tauri::command]
pub fn get_ffmpeg_status(app: AppHandle) -> FfmpegStatus {
    ffmpeg_status(resource_dir(&app).as_deref())
}

#[tauri::command]
pub fn get_subtitle_generation_availability(
    app: AppHandle,
    model: Option<String>,
) -> SubtitleGenerationAvailability {
    let res = resource_dir(&app);
    let res_ref = res.as_deref();
    let app_data = app_data_dir(&app).ok();
    let app_data_ref = app_data.as_deref();
    let ffmpeg_paths = locate_ffmpeg(res_ref).ok();
    let ffmpeg_available = ffmpeg_paths.is_some();
    let model_name = model.unwrap_or_else(|| "base".to_string());
    let settings = settings::load(&app).unwrap_or_else(|_| serde_json::json!({}));
    let gpu_config = load_whisper_gpu_config(&settings);
    let whisper_cli = locate_whisper_cli_for_generation(res_ref, &gpu_config);
    let whisper_gpu = whisper_cli
        .as_ref()
        .map(|_| probe_whisper_gpu_for_cli(res_ref, &gpu_config))
        .flatten();
    let whisper_model = locate_whisper_model_with_app_data(&model_name, res_ref, app_data_ref);
    let whisper_cli_available = whisper_cli.is_some();
    let whisper_model_available = whisper_model.is_some();
    let whisper_available = whisper_cli_available && whisper_model_available;

    let (can_generate, reason) = if !ffmpeg_available {
        (false, "unavailable_no_ffmpeg".to_string())
    } else if !whisper_cli_available {
        (false, "unavailable_no_backend".to_string())
    } else if !whisper_model_available {
        (false, "unavailable_no_model".to_string())
    } else {
        (true, "ready".to_string())
    };

    SubtitleGenerationAvailability {
        can_generate,
        ffmpeg_available,
        whisper_cli_available,
        whisper_model_available,
        whisper_model_name: model_name.clone(),
        whisper_available,
        ffmpeg_path: ffmpeg_paths
            .as_ref()
            .map(|p| p.ffmpeg.to_string_lossy().to_string()),
        whisper_cli_path: whisper_cli.map(|p| p.to_string_lossy().to_string()),
        whisper_model_path: whisper_model.map(|p| p.to_string_lossy().to_string()),
        whisper_model_hint: if whisper_model_available {
            None
        } else {
            whisper_model_hint(&model_name, res_ref)
        },
        translation_available: translation_backend_available_at(
            &load_translation_config(&settings),
            res_ref,
            app_data_ref,
        ),
        whisper_gpu_mode: gpu_config.mode.as_str().to_string(),
        whisper_gpu_available: whisper_gpu
            .as_ref()
            .map(|caps| caps.supports_gpu_layers)
            .unwrap_or(false),
        whisper_gpu_backend: whisper_gpu.and_then(|caps| caps.inferred_backend),
        whisper_gpu_layers: gpu_config.layers,
        reason,
    }
}

#[tauri::command]
pub fn list_whisper_models(app: AppHandle) -> Vec<String> {
    list_installed_whisper_models_with_app_data(
        resource_dir(&app).as_deref(),
        app_data_dir(&app).ok().as_deref(),
    )
}

#[tauri::command]
pub fn translate_subtitles_command(
    app: AppHandle,
    request: TranslateSubtitlesRequest,
) -> TranslateSubtitlesResponse {
    let video_path = PathBuf::from(&request.video_path);
    if !video_path.exists() {
        return TranslateSubtitlesResponse {
            status: "failed".into(),
            output_path: None,
            track_id: None,
            target_language: request.target_language.clone(),
            source_language: None,
            cue_count: 0,
            translated_cue_count: 0,
            detected_speakers: None,
            used_glossary: None,
            used_character_colors: false,
            error: Some("file not found".into()),
        };
    }
    let settings = settings::load(&app).unwrap_or_else(|_| serde_json::json!({}));
    let translation_config = load_translation_config(&settings);
    let app_data = match app_data_dir(&app) {
        Ok(p) => p,
        Err(e) => {
            return TranslateSubtitlesResponse {
                status: "failed".into(),
                output_path: None,
                track_id: None,
                target_language: request.target_language.clone(),
                source_language: None,
                cue_count: 0,
                translated_cue_count: 0,
                detected_speakers: None,
                used_glossary: None,
                used_character_colors: false,
                error: Some(e),
            };
        }
    };
    let ffmpeg = match locate_ffmpeg(resource_dir(&app).as_deref()) {
        Ok(p) => p.ffmpeg,
        Err(e) => {
            return TranslateSubtitlesResponse {
                status: "failed".into(),
                output_path: None,
                track_id: None,
                target_language: request.target_language.clone(),
                source_language: None,
                cue_count: 0,
                translated_cue_count: 0,
                detected_speakers: None,
                used_glossary: None,
                used_character_colors: false,
                error: Some(e.to_string()),
            };
        }
    };
    translate_subtitles(
        &app,
        &app_data,
        &ffmpeg,
        &video_path,
        &request,
        &translation_config,
    )
}

#[tauri::command]
pub fn translate_existing_subtitles(
    app: AppHandle,
    registry: State<'_, GenerationRegistry>,
    request: TranslateExistingSubtitlesRequest,
) -> Result<(), String> {
    let video_path = PathBuf::from(&request.video_path);
    if !video_path.exists() {
        return Err("file not found".to_string());
    }
    let source_path = PathBuf::from(&request.source_subtitle_path);
    if !source_path.is_file() {
        return Err("source subtitle file not found".to_string());
    }
    let settings = settings::load(&app)?;
    let translation_config = load_translation_config(&settings);
    if !translation_backend_available_at(
        &translation_config,
        resource_dir(&app).as_deref(),
        app_data_dir(&app).ok().as_deref(),
    ) {
        return Err("unavailable_no_translation".to_string());
    }
    let app_data = app_data_dir(&app)?;
    let name_style = NameStyle::from_str(request.name_style.as_deref().unwrap_or("romanized"));
    let speaker_color_mode = crate::services::subtitle_colors::SpeakerColorMode::from_str(
        request.speaker_color_mode.as_deref().unwrap_or("auto"),
    );
    let cancel_flag = registry.register(&request.video_id);
    translate_existing_subtitles_background(
        app,
        app_data,
        request.video_id,
        video_path,
        source_path,
        request.source_language,
        request.target_language,
        request.output_format.unwrap_or_else(|| "vtt".to_string()),
        request.franchise_key,
        request.mark_foreign_speech.unwrap_or(true),
        request.show_sound_labels.unwrap_or(false),
        name_style,
        speaker_color_mode,
        translation_config,
        cancel_flag,
    );
    Ok(())
}

#[tauri::command]
pub fn get_or_infer_character_color(
    app: AppHandle,
    request: GetCharacterColorRequest,
) -> GetCharacterColorResponse {
    let app_data = app_data_dir(&app).unwrap_or_default();
    let internal = InferCharacterColorRequest {
        franchise_key: request.franchise_key,
        video_key: request.video_key,
        video_path: request.video_path,
        character_name: request.character_name,
        speaker_id: request.speaker_id,
        context: InferColorSpeakerContext {
            cue_times: request.context.cue_times,
            subtitle_style_name: request.context.subtitle_style_name,
            source: request.context.source,
        },
    };
    let r = infer_character_color_api(&app_data, &internal);
    GetCharacterColorResponse {
        color: r.color,
        outline_color: r.outline_color,
        source: r.source,
        confidence: r.confidence,
        reason: r.reason,
        shadow: r.shadow,
        texture: r.texture,
        character_id: r.character_id,
    }
}

#[tauri::command]
pub fn set_character_color_override(
    app: AppHandle,
    request: SetCharacterColorOverrideRequest,
) -> Result<SetCharacterColorOverrideResponse, String> {
    let app_data = app_data_dir(&app)?;
    let result = set_color_override_svc(
        &app_data,
        request.franchise_key.as_deref(),
        request.video_key.as_deref(),
        &request.character_name,
        &request.color,
        &request.outline_color,
    )?;
    Ok(SetCharacterColorOverrideResponse {
        color: result.color,
        outline_color: result.outline_color,
        source: result.source.as_str().to_string(),
        confidence: result.confidence.as_str().to_string(),
    })
}

#[tauri::command]
pub fn reset_character_color_override(
    app: AppHandle,
    request: ResetCharacterColorRequest,
) -> Result<(), String> {
    let app_data = app_data_dir(&app)?;
    reset_color_override_svc(
        &app_data,
        request.franchise_key.as_deref(),
        request.video_key.as_deref(),
        &request.character_name,
    )
}

#[tauri::command]
pub fn discover_subtitles(
    app: AppHandle,
    video_id: String,
    video_path: String,
) -> Result<DiscoverSubtitlesResult, String> {
    let path = PathBuf::from(&video_path);
    if !path.exists() {
        return Err("file not found".to_string());
    }
    let indexed = SubtitleIndexStore::get_for_video(&app, &video_id);
    let indexed_slice = if indexed.is_empty() {
        None
    } else {
        Some(indexed.as_slice())
    };
    let app_data = app_data_dir(&app)?;
    let cache_dir = resolve_video_cache_dir(&app_data, &path).ok();
    let result = build_subtitle_tracks(&video_id, &path, indexed_slice, cache_dir.as_deref());
    Ok(result)
}

#[tauri::command]
pub fn extract_embedded_subtitle(
    app: AppHandle,
    video_id: String,
    video_path: String,
    track_index: u32,
    output_format: String,
) -> Result<SubtitleTrack, String> {
    let paths = locate_ffmpeg(resource_dir(&app).as_deref()).map_err(|e| e.to_string())?;
    let video = PathBuf::from(&video_path);
    let format = match output_format.to_lowercase().as_str() {
        "srt" => SubtitleFormat::Srt,
        "ass" | "ssa" => SubtitleFormat::Ass,
        _ => SubtitleFormat::Vtt,
    };
    let app_data = app_data_dir(&app)?;
    let cache_dir = resolve_video_cache_dir(&app_data, &video)?;
    let out = extract_embedded_to_cache(&paths.ffmpeg, &video, &cache_dir, track_index, format)?;
    let lang = "und".to_string();
    let video_key = crate::services::scanner::media_id_for_path(&video);
    Ok(SubtitleTrack {
        id: format!("{video_key}-embedded-{track_index}-extracted"),
        video_id,
        video_path: video_path.clone(),
        video_key,
        source: SubtitleSource::Embedded,
        language: lang.clone(),
        language_label: crate::services::subtitle_language::language_label(&lang),
        label: format!("Embedded — Track {track_index}"),
        format,
        path: Some(out.to_string_lossy().to_string()),
        embedded_track_index: Some(track_index),
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
    })
}

#[tauri::command]
pub fn probe_video_audio_streams(
    app: AppHandle,
    video_path: String,
) -> Result<Vec<VideoAudioStream>, String> {
    let path = PathBuf::from(&video_path);
    if !path.exists() {
        return Err("file not found".to_string());
    }
    let paths = locate_ffmpeg(resource_dir(&app).as_deref()).map_err(|e| e.to_string())?;
    list_video_audio_streams(&paths.ffprobe, &path)
}

#[tauri::command]
pub fn import_subtitle_for_video(
    app: AppHandle,
    video_id: String,
    video_path: String,
    subtitle_path: String,
) -> Result<DiscoverSubtitlesResult, String> {
    let video = PathBuf::from(&video_path);
    let source = PathBuf::from(&subtitle_path);
    if !video.exists() {
        return Err("file not found".to_string());
    }
    if !source.is_file() {
        return Err("subtitle file not found".to_string());
    }
    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("ass");
    let format = SubtitleFormat::from_extension(ext)
        .ok_or_else(|| "Unsupported subtitle format. Use .ass, .srt, or .vtt.".to_string())?;
    let app_data = app_data_dir(&app)?;
    let cache_dir = resolve_video_cache_dir(&app_data, &video)?;
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let lang_info = detect_subtitle_language(&source);
    let lang = lang_info.code.clone();
    let dest = cache_dir.join(format!("imported.{lang}.{}", format.as_str()));
    std::fs::copy(&source, &dest).map_err(|e| format!("Failed to import subtitle file: {e}"))?;
    let label = format!("Imported — {}", language_label(&lang));
    let entry = ExternalSubtitleIndexEntry {
        path: dest.to_string_lossy().to_string(),
        language: lang,
        format,
        label,
    };
    let mut map = std::collections::HashMap::new();
    map.insert(video_id.clone(), vec![entry]);
    SubtitleIndexStore::merge_entries(&app, map);
    let _ = SubtitleIndexStore::save_to_disk(&app);
    discover_subtitles(app, video_id, video_path)
}

#[tauri::command]
pub fn generate_subtitles(
    app: AppHandle,
    registry: State<'_, GenerationRegistry>,
    video_id: String,
    video_path: String,
    target_language: String,
    source_language: Option<String>,
    output_format: String,
    model: String,
    regenerate: Option<bool>,
    mark_foreign_speech: Option<bool>,
    generation_mode: Option<String>,
    prefer_external_subtitles: Option<bool>,
    show_sound_labels: Option<bool>,
    name_style: Option<String>,
    audio_stream_index: Option<u32>,
) -> Result<(), String> {
    let path = PathBuf::from(&video_path);
    if !path.exists() {
        return Err("file not found".to_string());
    }
    let mode = GenerationMode::from_str(generation_mode.as_deref().unwrap_or("auto"));
    let availability = get_subtitle_generation_availability(app.clone(), Some(model.clone()));
    if mode == GenerationMode::TranslateExisting {
        if !availability.ffmpeg_available {
            return Err("unavailable_no_ffmpeg".to_string());
        }
    } else if !availability.can_generate {
        return Err(availability.reason);
    }
    let source = source_language
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "auto".to_string());
    let cancel_flag = registry.register(&video_id);
    let app_data = app_data_dir(&app)?;
    let res_dir = resource_dir(&app);
    let settings = settings::load(&app)?;
    let translation_config = load_translation_config(&settings);
    generate_subtitles_background(
        app,
        app_data,
        video_id,
        path,
        target_language,
        source,
        output_format,
        model,
        regenerate.unwrap_or(false),
        mark_foreign_speech.unwrap_or(true),
        mode,
        prefer_external_subtitles.unwrap_or(true),
        show_sound_labels.unwrap_or(false),
        NameStyle::from_str(name_style.as_deref().unwrap_or("romanized")),
        cancel_flag,
        res_dir,
        translation_config,
        audio_stream_index.map(|v| v as usize),
    );
    Ok(())
}

#[tauri::command]
pub fn cancel_subtitle_generation(
    registry: State<'_, GenerationRegistry>,
    video_id: String,
) -> Result<(), String> {
    registry.cancel(&video_id);
    Ok(())
}

#[tauri::command]
pub fn clear_generated_subtitle_cache(
    app: AppHandle,
    video_path: Option<String>,
) -> Result<(), String> {
    let app_data = app_data_dir(&app)?;
    if let Some(path) = video_path {
        clear_video_cache(&app_data, &PathBuf::from(path))?;
    } else {
        clear_all_generated_cache(&app_data)?;
    }
    Ok(())
}

#[tauri::command]
pub fn refresh_subtitle_index_for_video(
    app: AppHandle,
    video_id: String,
    video_path: String,
) -> Result<DiscoverSubtitlesResult, String> {
    let path = PathBuf::from(&video_path);
    let external = crate::services::subtitle_discovery::discover_external_subtitles_in_dir(&path);
    let mut map = std::collections::HashMap::new();
    map.insert(video_id.clone(), external);
    SubtitleIndexStore::merge_entries(&app, map);
    let _ = SubtitleIndexStore::save_to_disk(&app);
    discover_subtitles(app, video_id, video_path)
}
