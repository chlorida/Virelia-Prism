use crate::models::{
    SubtitleCacheMetadata, SubtitleFormat, SubtitleGenerationDiagnostics, VideoAudioStream,
};
use crate::services::ffmpeg_util::{locate_ffmpeg, FfmpegError, FfmpegPaths};
use crate::services::scanner::media_id_for_path;
use crate::services::subtitle_cache::{
    generated_subtitle_path, resolve_video_cache_dir, write_metadata,
};
use crate::services::subtitle_colors::SpeakerColorMode;
use crate::services::subtitle_cue::{parse_subtitle_file_cues, write_vtt, GeneratedSubtitleCue};
use crate::services::subtitle_external_source::{
    find_best_external_source, load_external_cues, ExternalSourceKind, ExternalSubtitleSource,
};
use crate::services::subtitle_franchise::detect_franchise;
use crate::services::subtitle_generation_pipeline::detect_dominant_speech_language;
use crate::services::subtitle_generation_pipeline::{
    finalize_generated_subtitles, parse_whisper_detected_language, translate_cues_for_partial_preview,
    FinalizeOptions, GeneratedSubtitleMetadata, GenerationMethod, PipelineResult,
};
use crate::services::subtitle_glossary::NameStyle;
use crate::services::subtitle_language::{detect_subtitle_language, normalize_metadata_language};
use crate::services::subtitle_translation::{
    translate_cues_in_batches, TranslationConfig, TranslationHostContext,
};
use crate::services::process_util::hidden_command;
use crate::services::whisper_runtime::{
    apply_whisper_runtime_args, is_gpu_transcription_failure, load_whisper_gpu_config,
    locate_whisper_binary, probe_whisper_gpu_capabilities, WhisperGpuConfig,
    WhisperGpuCapabilities, WhisperSessionRuntime,
};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct GenerationRegistry {
    cancel_flags: Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>,
}

impl GenerationRegistry {
    pub fn register(&self, video_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut guard) = self.cancel_flags.lock() {
            guard.insert(video_id.to_string(), flag.clone());
        }
        flag
    }

    pub fn cancel(&self, video_id: &str) {
        if let Ok(guard) = self.cancel_flags.lock() {
            if let Some(flag) = guard.get(video_id) {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }

    pub fn remove(&self, video_id: &str) {
        if let Ok(mut guard) = self.cancel_flags.lock() {
            guard.remove(video_id);
        }
    }
}

/// Clips at or below this length use one Whisper pass (no segment loop).
const SINGLE_PASS_MAX_SECONDS: f64 = 60.0;

/// Partial subtitle track updates after each segment of this length.
const PROGRESSIVE_SEGMENT_SECONDS: f64 = 60.0;

fn uses_single_pass_whisper(duration_sec: f64) -> bool {
    duration_sec > 0.0 && duration_sec <= SINGLE_PASS_MAX_SECONDS
}

fn segment_duration_for_video(_duration_sec: f64) -> f64 {
    PROGRESSIVE_SEGMENT_SECONDS
}

fn whisper_thread_count() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .clamp(1, 12)
}

struct AudioSegmentSource<'a> {
    full_wav: Option<&'a Path>,
    video_path: &'a Path,
    audio_stream_index: usize,
    from_video: bool,
}

fn emit_progress(app: &AppHandle, video_id: &str, progress: f32, message: &str) {
    let _ = app.emit(
        "subtitle-generation-progress",
        serde_json::json!({
            "videoId": video_id,
            "progress": progress,
            "message": message,
        }),
    );
}

fn emit_progress_detail(
    app: &AppHandle,
    video_id: &str,
    progress: f32,
    message: &str,
    detail: serde_json::Value,
) {
    let mut payload = serde_json::json!({
        "videoId": video_id,
        "progress": progress,
        "message": message,
    });
    if let Some(obj) = payload.as_object_mut() {
        if let Some(d) = detail.as_object() {
            for (k, v) in d {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    let _ = app.emit("subtitle-generation-progress", payload);
}

fn emit_partial(app: &AppHandle, video_id: &str, path: &str, detail: serde_json::Value) {
    let mut payload = serde_json::json!({
        "videoId": video_id,
        "path": path,
        "status": "partial_ready",
    });
    if let Some(obj) = payload.as_object_mut() {
        if let Some(d) = detail.as_object() {
            for (k, v) in d {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    let _ = app.emit("subtitle-generation-partial", payload);
}

fn emit_started(app: &AppHandle, video_id: &str) {
    let _ = app.emit(
        "subtitle-generation-started",
        serde_json::json!({ "videoId": video_id }),
    );
}

fn emit_completed(app: &AppHandle, video_id: &str, path: &str) {
    let _ = app.emit(
        "subtitle-generation-completed",
        serde_json::json!({ "videoId": video_id, "path": path }),
    );
}

fn emit_failed(
    app: &AppHandle,
    video_id: &str,
    error: &str,
    diagnostics: Option<SubtitleGenerationDiagnostics>,
) {
    let _ = app.emit(
        "subtitle-generation-failed",
        serde_json::json!({
            "videoId": video_id,
            "error": error,
            "diagnostics": diagnostics,
        }),
    );
}

fn format_stream_label(stream: &AudioStreamInfo) -> String {
    let lang = stream
        .language
        .as_deref()
        .map(crate::services::subtitle_language::language_label)
        .unwrap_or_else(|| "Unknown".to_string());
    let title = stream.title.as_deref().unwrap_or("");
    let codec = stream.codec.as_deref().unwrap_or("audio");
    if title.is_empty() {
        format!("{lang} — {codec}")
    } else {
        format!("{title} ({lang}, {codec})")
    }
}

pub fn list_video_audio_streams(
    ffprobe: &Path,
    video_path: &Path,
) -> Result<Vec<VideoAudioStream>, String> {
    let streams = probe_audio_streams(ffprobe, video_path)?;
    Ok(streams
        .into_iter()
        .map(|s| VideoAudioStream {
            index: s.index,
            is_default: s.is_default,
            language: s.language.clone(),
            title: s.title.clone(),
            codec: s.codec.clone(),
            channels: s.channels,
            sample_rate: s.sample_rate,
            label: format_stream_label(&s),
            is_commentary: is_commentary_or_non_dialogue_stream(&s),
        })
        .collect())
}

pub fn build_generation_failure_diagnostics(
    cache_dir: &Path,
    video_path: &Path,
    ffprobe: &Path,
    error: &str,
    model: &str,
    target_language: &str,
    source_language: &str,
) -> SubtitleGenerationDiagnostics {
    let video_duration_sec = probe_video_duration(ffprobe, video_path);
    let audio_debug = std::fs::read_to_string(cache_dir.join("audio-extract.debug.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
    let selected_audio_stream = audio_debug
        .as_ref()
        .and_then(|v| v.get("selectedStreamIndex"))
        .map(|v| format!("0:a:{}", v.as_u64().unwrap_or(0)));
    let audio_language = audio_debug
        .as_ref()
        .and_then(|v| v.get("streams"))
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            let idx = audio_debug
                .as_ref()
                .and_then(|d| d.get("selectedStreamIndex"))
                .and_then(|v| v.as_u64())? as usize;
            arr.iter()
                .find(|s| s.get("index").and_then(|v| v.as_u64()) == Some(idx as u64))
        })
        .and_then(|s| s.get("language"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let audio_duration_sec = audio_debug
        .as_ref()
        .and_then(|v| v.get("extractedWavDurationSec"))
        .and_then(|v| v.as_f64());
    let extracted_audio_bytes = std::fs::metadata(cache_dir.join("audio-extract.wav"))
        .ok()
        .map(|m| m.len());

    let mut generated_cue_count = None;
    let mut coverage_ratio = None;
    if let Ok(read) = std::fs::read_dir(cache_dir) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("generated.") || !name.ends_with(".meta.json") {
                continue;
            }
            if let Ok(raw) = std::fs::read_to_string(entry.path()) {
                if let Ok(meta) = serde_json::from_str::<
                    crate::services::subtitle_generation_pipeline::GeneratedSubtitleMetadata,
                >(&raw)
                {
                    generated_cue_count = Some(meta.cue_count);
                    coverage_ratio = meta.coverage_ratio;
                }
            }
        }
    }

    let message = match error {
        "too-few-cues" | "low-coverage" | "output-too-small" => {
            "Speech recognition produced too few subtitles.".to_string()
        }
        "unavailable_no_backend" => {
            "Speech recognition backend is not configured. Install whisper-cli.".to_string()
        }
        "unavailable_no_model" => {
            "Speech recognition model file is missing or incomplete. Re-download it from Settings.".to_string()
        }
        err if err.contains("whisper_model_init_failed") => {
            "Speech model could not be loaded. Re-download ggml model or choose a smaller model.".to_string()
        }
        err if err.contains("whisper_transcription_failed") => err.to_string(),
        "unavailable_no_translation" => {
            "Translation backend is not configured. Set Settings → Subtitles → Translation to Local HTTP (LibreTranslate at http://127.0.0.1:5000) to translate existing subtitles.".to_string()
        }
        _ => error.to_string(),
    };

    let mut recovered_cue_count = None;
    let mut coverage_until_seconds = None;
    if let Ok(read) = std::fs::read_dir(cache_dir) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".partial.meta.json") {
                continue;
            }
            if let Ok(raw) = std::fs::read_to_string(entry.path()) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                    recovered_cue_count = v
                        .get("cueCount")
                        .and_then(|n| n.as_u64())
                        .map(|n| n as usize);
                    coverage_until_seconds = v.get("coverageUntilSeconds").and_then(|n| n.as_f64());
                }
            }
        }
    }
    if recovered_cue_count.is_none() {
        let partial_path = partial_subtitle_path(cache_dir, target_language, SubtitleFormat::Vtt);
        if partial_path.exists() {
            if let Ok(raw) = std::fs::read_to_string(&partial_path) {
                let cues = parse_subtitle_file_cues(&raw, "vtt");
                if !cues.is_empty() {
                    recovered_cue_count = Some(cues.len());
                    coverage_until_seconds =
                        Some(cues.iter().map(|c| c.end).fold(0.0_f64, f64::max));
                }
            }
        }
    }

    SubtitleGenerationDiagnostics {
        reason: error.to_string(),
        message,
        video_duration_sec,
        generated_cue_count: recovered_cue_count.or(generated_cue_count),
        coverage_ratio,
        selected_audio_stream,
        audio_language,
        audio_duration_sec,
        extracted_audio_bytes,
        transcription_backend: "whisper.cpp".to_string(),
        model_name: model.to_string(),
        source_language_mode: if source_language == "auto" {
            "auto".to_string()
        } else {
            source_language.to_string()
        },
        target_language: target_language.to_string(),
        recovered_cue_count,
        coverage_until_seconds,
    }
}

fn write_generation_failure_diagnostics(
    cache_dir: &Path,
    diagnostics: &SubtitleGenerationDiagnostics,
) {
    let path = cache_dir.join("generation-failure.diagnostics.json");
    if let Ok(json) = serde_json::to_string_pretty(diagnostics) {
        let _ = std::fs::write(path, json);
    }
}

fn emit_cancelled(app: &AppHandle, video_id: &str) {
    let _ = app.emit(
        "subtitle-generation-cancelled",
        serde_json::json!({ "videoId": video_id }),
    );
}

pub fn probe_video_duration(ffprobe: &Path, video_path: &Path) -> Option<f64> {
    let output = hidden_command(ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &video_path.to_string_lossy(),
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let duration: f64 = text.trim().parse().ok()?;
    if duration.is_finite() && duration > 0.0 {
        Some(duration)
    } else {
        None
    }
}

fn has_audio_stream(ffprobe: &Path, video_path: &Path) -> bool {
    let output = hidden_command(ffprobe)
        .args([
            "-v",
            "quiet",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            &video_path.to_string_lossy(),
        ])
        .output();
    match output {
        Ok(o) if o.status.success() => !o.stdout.is_empty(),
        _ => false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GenerationMode {
    Auto,
    TranslateExisting,
    FromAudio,
}

impl GenerationMode {
    pub fn from_str(raw: &str) -> Self {
        match raw {
            "translate_existing" => Self::TranslateExisting,
            "from_audio" => Self::FromAudio,
            _ => Self::Auto,
        }
    }
}

#[derive(Debug, Clone)]
struct AudioStreamInfo {
    index: usize,
    is_default: bool,
    language: Option<String>,
    title: Option<String>,
    codec: Option<String>,
    channels: Option<u32>,
    sample_rate: Option<u32>,
}

fn probe_audio_streams(ffprobe: &Path, video_path: &Path) -> Result<Vec<AudioStreamInfo>, String> {
    let output = hidden_command(ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-select_streams",
            "a",
            &video_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("No audio track found, subtitles cannot be generated.".to_string());
    }
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    let streams = json
        .get("streams")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for stream in streams {
        let index = stream.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let disposition = stream.get("disposition");
        let is_default = disposition
            .and_then(|d| d.get("default"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            == 1;
        let tags = stream.get("tags");
        out.push(AudioStreamInfo {
            index,
            is_default,
            language: tags
                .and_then(|t| t.get("language"))
                .and_then(|v| v.as_str())
                .map(str::to_string),
            title: tags
                .and_then(|t| t.get("title"))
                .and_then(|v| v.as_str())
                .map(str::to_string),
            codec: stream
                .get("codec_name")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            channels: stream
                .get("channels")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32),
            sample_rate: stream
                .get("sample_rate")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok()),
        });
    }
    Ok(out)
}

fn is_commentary_or_non_dialogue_stream(stream: &AudioStreamInfo) -> bool {
    let haystack = format!(
        "{} {}",
        stream.title.as_deref().unwrap_or(""),
        stream.language.as_deref().unwrap_or("")
    )
    .to_lowercase();
    [
        "commentary",
        "comment",
        "signs",
        "music",
        "effects",
        "score",
        "isolated",
    ]
    .iter()
    .any(|needle| haystack.contains(needle))
}

fn stream_matches_language(stream: &AudioStreamInfo, source_language: &str) -> bool {
    let Some(stream_lang) = stream.language.as_deref() else {
        return false;
    };
    let normalized_stream = normalize_metadata_language(stream_lang).code;
    let normalized_source = normalize_metadata_language(source_language).code;
    normalized_stream == normalized_source && normalized_source != "und"
}

fn select_audio_stream(streams: &[AudioStreamInfo], source_language: &str) -> Option<usize> {
    if streams.is_empty() {
        return None;
    }
    let commentary_filtered: Vec<&AudioStreamInfo> = streams
        .iter()
        .filter(|s| !is_commentary_or_non_dialogue_stream(s))
        .collect();
    let pool: Vec<&AudioStreamInfo> = if commentary_filtered.is_empty() {
        streams.iter().collect()
    } else {
        commentary_filtered
    };
    if source_language != "auto" && !source_language.is_empty() {
        if let Some(found) = pool
            .iter()
            .find(|s| stream_matches_language(s, source_language))
        {
            return Some(found.index);
        }
    }
    if source_language == "auto" {
        if let Some(found) = pool.iter().find(|s| stream_matches_language(s, "ja")) {
            return Some(found.index);
        }
    }
    pool.iter()
        .find(|s| s.is_default)
        .or_else(|| pool.first())
        .map(|s| s.index)
}

fn should_fallback_to_audio_generation(external_err: &str) -> bool {
    matches!(
        external_err,
        "no_external_subtitles" | "External subtitle file contains no cues."
    )
}

fn write_audio_extraction_debug(cache_dir: &Path, info: &serde_json::Value) {
    let path = cache_dir.join("audio-extract.debug.json");
    if let Ok(json) = serde_json::to_string_pretty(info) {
        let _ = std::fs::write(path, json);
    }
}

fn validate_extracted_wav(
    wav_path: &Path,
    expected_duration_hint: Option<f64>,
) -> Result<f64, String> {
    let meta = std::fs::metadata(wav_path).map_err(|e| e.to_string())?;
    if meta.len() < 1024 {
        return Err("extracted_audio_silent".to_string());
    }
    let bytes = std::fs::read(wav_path).map_err(|e| e.to_string())?;
    if bytes.len() < 44 {
        return Err("extracted_audio_silent".to_string());
    }
    let data = &bytes[44..];
    if data.len() < 2 {
        return Err("extracted_audio_silent".to_string());
    }
    let mut sum_sq = 0f64;
    let mut count = 0usize;
    for chunk in data.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f64 / 32768.0;
        sum_sq += sample * sample;
        count += 1;
    }
    let rms = if count > 0 {
        (sum_sq / count as f64).sqrt()
    } else {
        0.0
    };
    let duration = count as f64 / 16000.0;
    if rms < 0.002 {
        return Err("extracted_audio_silent".to_string());
    }
    if let Some(expected) = expected_duration_hint {
        if expected > 30.0 && duration < expected * 0.2 {
            return Err("extracted_audio_invalid".to_string());
        }
    }
    Ok(duration)
}

fn extract_audio_wav(
    ffmpeg: &Path,
    ffprobe: &Path,
    video_path: &Path,
    out_wav: &Path,
    cache_dir: &Path,
    source_language: &str,
    audio_stream_index: Option<usize>,
) -> Result<(), String> {
    let streams = probe_audio_streams(ffprobe, video_path)?;
    let stream_index = audio_stream_index
        .or_else(|| select_audio_stream(&streams, source_language))
        .ok_or_else(|| "No audio track found, subtitles cannot be generated.".to_string())?;
    let map_arg = format!("0:{stream_index}");
    let output = hidden_command(ffmpeg)
        .args([
            "-y",
            "-i",
            &video_path.to_string_lossy(),
            "-map",
            &map_arg,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            &out_wav.to_string_lossy(),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() || !out_wav.exists() {
        return Err("No audio track found, subtitles cannot be generated.".to_string());
    }
    let wav_duration = validate_extracted_wav(out_wav, None)?;
    write_audio_extraction_debug(
        cache_dir,
        &serde_json::json!({
            "videoPath": video_path.to_string_lossy(),
            "selectedStreamIndex": stream_index,
            "streams": streams.iter().map(|s| serde_json::json!({
                "index": s.index,
                "default": s.is_default,
                "language": s.language,
                "title": s.title,
                "codec": s.codec,
                "channels": s.channels,
                "sampleRate": s.sample_rate,
            })).collect::<Vec<_>>(),
            "extractedWavPath": out_wav.to_string_lossy(),
            "extractedWavBytes": std::fs::metadata(out_wav).map(|m| m.len()).unwrap_or(0),
            "extractedWavDurationSec": wav_duration,
            "ffmpegStderrTail": stderr.chars().rev().take(1200).collect::<String>().chars().rev().collect::<String>(),
        }),
    );
    Ok(())
}

fn whisper_cli_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &[
            "whisper-cli.exe",
            "whisper.exe",
            "main.exe",
            "whisper-cpp.exe",
        ]
    } else {
        &["whisper-cli", "whisper", "main"]
    }
}

fn whisper_cli_candidates(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();
    if let Some(res) = resource_dir {
        for name in whisper_cli_names() {
            paths.push(res.join("bin/windows").join(name));
            paths.push(res.join("bin").join(name));
            paths.push(res.join(name));
            paths.push(res.join("whisper").join(name));
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest.parent().unwrap_or(&manifest);
    for name in whisper_cli_names() {
        paths.push(manifest.join("resources/bin/windows").join(name));
        paths.push(project_root.join("tools/whisper").join(name));
        paths.push(project_root.join("vendor/whisper").join(name));
    }
    if let Ok(ffmpeg) = crate::services::ffmpeg_util::locate_ffmpeg(resource_dir) {
        let dir = ffmpeg.ffmpeg.parent().unwrap_or(Path::new("."));
        for name in whisper_cli_names() {
            paths.push(dir.join(name));
        }
    }
    paths
}

pub fn locate_whisper_cli(resource_dir: Option<&Path>) -> Option<PathBuf> {
    locate_whisper_cli_for_generation(resource_dir, &WhisperGpuConfig::default())
}

pub fn locate_whisper_cli_for_generation(
    resource_dir: Option<&Path>,
    gpu_config: &WhisperGpuConfig,
) -> Option<PathBuf> {
    if let Some(path) = locate_whisper_binary(resource_dir, gpu_config) {
        return Some(path);
    }
    for name in whisper_cli_names() {
        if let Some(path) = which_binary(name) {
            return Some(path);
        }
    }
    None
}

pub fn probe_whisper_gpu_for_cli(
    resource_dir: Option<&Path>,
    gpu_config: &WhisperGpuConfig,
) -> Option<WhisperGpuCapabilities> {
    locate_whisper_cli_for_generation(resource_dir, gpu_config)
        .map(|cli| probe_whisper_gpu_capabilities(&cli))
}

pub fn quick_whisper_cli_available(resource_dir: Option<&Path>) -> bool {
    locate_whisper_binary(resource_dir, &WhisperGpuConfig::default()).is_some()
        || whisper_cli_candidates(resource_dir)
            .iter()
            .any(|path| path.is_file())
}

fn which_binary(binary: &str) -> Option<PathBuf> {
    let output = if cfg!(windows) {
        hidden_command("where").arg(binary).output().ok()
    } else {
        hidden_command("which").arg(binary).output().ok()
    };
    let output = output?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let first = text.lines().map(str::trim).find(|l| !l.is_empty())?;
    let path = PathBuf::from(first);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

const WHISPER_MODEL_IDS: &[&str] = &[
    "tiny",
    "base",
    "small",
    "medium",
    "large-v1",
    "large-v2",
    "large-v3",
    "large-v3-turbo",
];

fn whisper_model_filenames(model: &str) -> Vec<String> {
    vec![format!("ggml-{model}.bin"), format!("ggml-{model}.en.bin")]
}

fn whisper_model_filename_matches(filename: &str, model: &str) -> bool {
    if whisper_model_filenames(model)
        .iter()
        .any(|name| name == filename)
    {
        return true;
    }
    let prefix = format!("ggml-{model}");
    filename.starts_with(&prefix)
        && filename.ends_with(".bin")
        && (filename.len() == prefix.len() + 4
            || filename
                .as_bytes()
                .get(prefix.len())
                .is_some_and(|b| *b == b'-' || *b == b'_' || *b == b'.'))
}

fn whisper_model_id_from_filename(filename: &str) -> Option<String> {
    let stem = filename.strip_suffix(".bin")?;
    let rest = stem.strip_prefix("ggml-")?;
    let rest = rest.strip_suffix(".en").unwrap_or(rest);
    let mut model_ids: Vec<&str> = WHISPER_MODEL_IDS.to_vec();
    model_ids.sort_by_key(|id| std::cmp::Reverse(id.len()));
    for model_id in model_ids {
        if rest == model_id
            || rest.starts_with(&format!("{model_id}-"))
            || rest.starts_with(&format!("{model_id}_"))
        {
            return Some(model_id.to_string());
        }
    }
    None
}

fn whisper_model_candidates(
    resource_dir: Option<&Path>,
    app_data_dir: Option<&Path>,
) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(app_data) = app_data_dir {
        dirs.push(app_data.join("models"));
    }
    if let Some(res) = resource_dir {
        dirs.push(res.join("models"));
        dirs.push(res.join("whisper/models"));
        dirs.push(res.join("bin/windows/models"));
        dirs.push(res.join("bin/windows"));
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest.parent().unwrap_or(&manifest);
    dirs.push(manifest.join("resources/models"));
    dirs.push(manifest.join("resources/bin/windows/models"));
    dirs.push(manifest.join("resources/bin/windows"));
    dirs.push(project_root.join("tools/whisper/models"));
    dirs.push(project_root.join("vendor/whisper/models"));
    dirs.push(PathBuf::from("models"));
    dirs.push(PathBuf::from(r"C:\whisper\models"));
    if let Some(home) = std::env::home_dir() {
        dirs.push(home.join(".cache/whisper"));
    }
    if let Ok(ffmpeg) = crate::services::ffmpeg_util::locate_ffmpeg(resource_dir) {
        if let Some(parent) = ffmpeg.ffmpeg.parent() {
            dirs.push(parent.to_path_buf());
            dirs.push(parent.join("models"));
        }
    }
    if let Some(whisper) = locate_whisper_cli(resource_dir) {
        if let Some(parent) = whisper.parent() {
            dirs.push(parent.to_path_buf());
        }
    }
    let mut unique = Vec::new();
    for dir in dirs {
        if !unique.iter().any(|existing: &PathBuf| existing == &dir) {
            unique.push(dir);
        }
    }
    unique
}

pub fn whisper_model_hint(model: &str, resource_dir: Option<&Path>) -> Option<String> {
    if locate_whisper_model(model, resource_dir).is_some() {
        return None;
    }
    let expected = format!("ggml-{model}.bin");
    let mut notes = vec![format!("Expected file: {expected}")];
    for dir in whisper_model_candidates(resource_dir, None) {
        if !dir.exists() {
            continue;
        }
        let mut names: Vec<String> = Vec::new();
        if let Ok(read) = std::fs::read_dir(&dir) {
            for entry in read.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".bin") || name.ends_with(".dll") {
                    names.push(name);
                }
            }
        }
        if !names.is_empty() {
            names.sort();
            notes.push(format!(
                "Found in {}: {}",
                dir.to_string_lossy(),
                names.join(", ")
            ));
        }
    }
    if notes.len() == 1 {
        notes.push(
            "Download ggml-base.bin from huggingface.co/ggerganov/whisper.cpp and place in resources/models/"
                .to_string(),
        );
    } else {
        notes.push(
            "DLL files alone are not enough — you need the .bin model weights file.".to_string(),
        );
    }
    Some(notes.join("\n"))
}

fn whisper_runtime_path_dirs(whisper: &Path, resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(parent) = whisper.parent() {
        dirs.push(parent.to_path_buf());
    }
    if let Some(res) = resource_dir {
        dirs.push(res.join("bin/windows"));
        dirs.push(res.join("models"));
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    dirs.push(manifest.join("resources/bin/windows"));
    dirs.push(manifest.join("resources/models"));
    dirs
}

fn configure_whisper_command(cmd: &mut Command, whisper: &Path, resource_dir: Option<&Path>) {
    #[cfg(windows)]
    {
        let extra: Vec<String> = whisper_runtime_path_dirs(whisper, resource_dir)
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        if !extra.is_empty() {
            let current = std::env::var_os("PATH").map(|p| p.to_string_lossy().to_string());
            let merged = match current {
                Some(path) => format!("{};{}", extra.join(";"), path),
                None => extra.join(";"),
            };
            cmd.env("PATH", merged);
        }
    }
}

pub fn locate_whisper_model(model: &str, resource_dir: Option<&Path>) -> Option<PathBuf> {
    locate_whisper_model_with_app_data(model, resource_dir, None)
}

pub fn locate_whisper_model_with_app_data(
    model: &str,
    resource_dir: Option<&Path>,
    app_data_dir: Option<&Path>,
) -> Option<PathBuf> {
    let exact_names = whisper_model_filenames(model);
    let mut quantized_match: Option<PathBuf> = None;
    for dir in whisper_model_candidates(resource_dir, app_data_dir) {
        for name in &exact_names {
            let path = dir.join(name);
            if path.exists() && is_valid_whisper_model_file(&path, model) {
                return Some(path);
            }
        }
        if quantized_match.is_some() {
            continue;
        }
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if whisper_model_filename_matches(&name, model) {
                let candidate = entry.path();
                if is_valid_whisper_model_file(&candidate, model) {
                    quantized_match = Some(candidate);
                    break;
                }
            }
        }
    }
    quantized_match
}

pub fn list_installed_whisper_models_with_app_data(
    resource_dir: Option<&Path>,
    app_data_dir: Option<&Path>,
) -> Vec<String> {
    let mut installed: Vec<String> = Vec::new();
    for dir in whisper_model_candidates(resource_dir, app_data_dir) {
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("ggml-") || !name.ends_with(".bin") {
                continue;
            }
            if let Some(model_id) = whisper_model_id_from_filename(&name) {
                if is_valid_whisper_model_file(&entry.path(), &model_id)
                    && !installed.iter().any(|existing| existing == &model_id)
                {
                    installed.push(model_id);
                }
            }
        }
    }
    installed.sort_by(|a, b| {
        let rank = |id: &str| {
            WHISPER_MODEL_IDS
                .iter()
                .position(|candidate| *candidate == id)
        };
        match (rank(a), rank(b)) {
            (Some(left), Some(right)) => left.cmp(&right),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.cmp(b),
        }
    });
    installed
}

pub fn minimum_whisper_model_bytes(model: &str) -> u64 {
    match model {
        "tiny" => 20_000_000,
        "base" => 80_000_000,
        "small" => 250_000_000,
        "medium" => 350_000_000,
        "large-v1" | "large-v2" | "large-v3" => 900_000_000,
        "large-v3-turbo" => 700_000_000,
        _ => 10_000_000,
    }
}

pub fn is_valid_whisper_model_file(path: &Path, model: &str) -> bool {
    std::fs::metadata(path)
        .map(|meta| meta.len() >= minimum_whisper_model_bytes(model))
        .unwrap_or(false)
}

fn whisper_language_arg(language: &str) -> &str {
    if language == "auto" || language == "und" || language.is_empty() {
        "auto"
    } else {
        language
    }
}

fn summarize_whisper_stderr(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr);
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    lines
        .iter()
        .rev()
        .take(4)
        .copied()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_whisper_transcription_error(stderr: &[u8], code: Option<i32>) -> String {
    let snippet = summarize_whisper_stderr(stderr);
    let lower = snippet.to_ascii_lowercase();
    if lower.contains("failed to initialize whisper context") {
        return "whisper_model_init_failed: Speech model could not be loaded. The download may be incomplete — re-download the model or choose a smaller one.".to_string();
    }
    if snippet.is_empty() {
        return format!("whisper_transcription_failed: whisper exited with code {:?}", code);
    }
    format!("whisper_transcription_failed: {snippet}")
}

fn parse_whisper_output_path_from_stderr(stderr: &[u8]) -> Option<PathBuf> {
    let text = String::from_utf8_lossy(stderr);
    for line in text.lines() {
        let trimmed = line.trim();
        for marker in ["saving output to '", "saving output to \""] {
            let Some(rest) = trimmed.split(marker).nth(1) else {
                continue;
            };
            let path = rest
                .trim_end_matches('\'')
                .trim_end_matches('"')
                .trim();
            if path.is_empty() {
                continue;
            }
            let candidate = PathBuf::from(path);
            return Some(candidate);
        }
    }
    None
}

fn resolve_whisper_output_path(prefix: &Path, wav_path: &Path, ext: &str) -> Option<PathBuf> {
    let direct = PathBuf::from(format!("{}.{}", prefix.to_string_lossy(), ext));
    if direct.is_file() {
        return Some(direct);
    }
    let beside_wav = wav_path.with_extension(ext);
    if beside_wav.is_file() {
        return Some(beside_wav);
    }
    if let Some(parent) = prefix.parent() {
        if let Some(stem) = prefix.file_name().and_then(|name| name.to_str()) {
            let nested = parent.join(format!("{stem}.{ext}"));
            if nested.is_file() {
                return Some(nested);
            }
        }
    }
    None
}

fn resolve_whisper_output_path_with_retry(
    prefix: &Path,
    wav_path: &Path,
    ext: &str,
    stderr: &[u8],
) -> Option<PathBuf> {
    for attempt in 0..8 {
        if let Some(path) = resolve_whisper_output_path(prefix, wav_path, ext) {
            return Some(path);
        }
        if let Some(path) = parse_whisper_output_path_from_stderr(stderr) {
            if path.is_file() {
                return Some(path);
            }
        }
        if attempt < 7 {
            std::thread::sleep(std::time::Duration::from_millis(25 * (attempt as u64 + 1)));
        }
    }
    None
}

fn segment_output_exists(prefix: &Path, ext: &str) -> Option<PathBuf> {
    resolve_whisper_output_path(prefix, prefix, ext)
}

fn should_whisper_translate_to_english(target_language: &str, whisper_source: &str) -> bool {
    target_language == "en" && whisper_source != "en" && !whisper_source.is_empty()
}

fn run_whisper_transcription(
    whisper: &Path,
    model_path: &Path,
    wav_path: &Path,
    language: &str,
    out_prefix: &Path,
    format: SubtitleFormat,
    resource_dir: Option<&Path>,
    model: &str,
    translate_to_english: bool,
    runtime: &mut WhisperSessionRuntime,
) -> Result<(PathBuf, Option<String>), String> {
    if !is_valid_whisper_model_file(model_path, model) {
        return Err(format!(
            "unavailable_no_model: Speech model ggml-{model}.bin is missing or incomplete. Re-download it from Settings."
        ));
    }

    loop {
        let mut cmd = hidden_command(whisper);
        configure_whisper_command(&mut cmd, whisper, resource_dir);
        let threads = whisper_thread_count();
        cmd.arg("-m").arg(model_path);
        cmd.arg("-f").arg(wav_path);
        cmd.arg("-l").arg(whisper_language_arg(language));
        if translate_to_english {
            cmd.arg("-tr");
        }
        cmd.arg("-t").arg(threads.to_string());
        cmd.arg("-bs").arg("1");
        cmd.arg("-bo").arg("1");
        cmd.arg("-nfa");
        apply_whisper_runtime_args(&mut cmd, runtime);
        cmd.arg("-np");
        match format {
            SubtitleFormat::Srt => {
                cmd.arg("-osrt");
            }
            SubtitleFormat::Vtt => {
                cmd.arg("-ovtt");
            }
            _ => {
                cmd.arg("-ovtt");
            }
        }
        cmd.arg("-of").arg(out_prefix);
        cmd.stdout(Stdio::null()).stderr(Stdio::piped());
        let output = cmd
            .output()
            .map_err(|e| format!("whisper_transcription_failed: {e}"))?;
        let detected = parse_whisper_detected_language(&output.stderr);

        if !output.status.success() {
            if runtime.plan.use_gpu
                && !runtime.gpu_fallback_applied
                && is_gpu_transcription_failure(&output.stderr)
            {
                runtime.gpu_fallback_applied = true;
                runtime.plan.use_gpu = false;
                eprintln!(
                    "[Virelia subtitles] GPU transcription failed; falling back to CPU. {}",
                    summarize_whisper_stderr(&output.stderr)
                );
                continue;
            }
            return Err(format_whisper_transcription_error(
                &output.stderr,
                output.status.code(),
            ));
        }

        let ext = format.as_str();
        if let Some(path) =
            resolve_whisper_output_path_with_retry(out_prefix, wav_path, ext, &output.stderr)
        {
            let detected_lang = if translate_to_english {
                Some("en".to_string())
            } else {
                detected
            };
            return Ok((path, detected_lang));
        }

        if runtime.plan.use_gpu && !runtime.gpu_fallback_applied {
            runtime.gpu_fallback_applied = true;
            runtime.plan.use_gpu = false;
            eprintln!("[Virelia subtitles] GPU produced no output; retrying on CPU.");
            continue;
        }

        let detail = summarize_whisper_stderr(&output.stderr);
        return Err(if detail.is_empty() {
            "whisper_transcription_failed: Whisper finished without writing subtitle output."
                .to_string()
        } else {
            format!("whisper_transcription_failed: Whisper finished without output file. {detail}")
        });
    }
}

fn is_review_video(video_path: &Path) -> bool {
    let lower = video_path.to_string_lossy().to_lowercase();
    lower.contains("review") || lower.contains("essay") || lower.contains("обзор")
}

fn build_finalize_options<'a>(
    video_path: &'a Path,
    video_key: &'a str,
    target_language: &'a str,
    source_language: &str,
    detected_source_language: Option<String>,
    mark_foreign_speech: bool,
    show_sound_labels: bool,
    name_style: NameStyle,
    model: &'a str,
    backend: &'a str,
    generation_method: GenerationMethod,
    source_subtitle_path: Option<String>,
    run_cleanup: bool,
    translation_config: &'a TranslationConfig,
    app_data: &'a Path,
    output_format: &'a str,
    video_duration_sec: Option<f64>,
    franchise_key: Option<&'a str>,
    speaker_color_mode: SpeakerColorMode,
    translation_already_applied: bool,
    translation_host: &TranslationHostContext,
) -> FinalizeOptions<'a> {
    FinalizeOptions {
        video_path,
        video_key,
        target_language,
        source_language_mode: source_language_mode(source_language),
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
        app_data: Some(app_data),
        franchise_key,
        speaker_color_mode,
        preserve_honorifics: true,
        video_type_review: is_review_video(video_path),
        output_format,
        video_duration_sec,
        translation_already_applied,
        translation_host: Some(translation_host.clone()),
    }
}

fn make_translation_host(
    app: &AppHandle,
    resource_dir: Option<&Path>,
    app_data: &Path,
) -> TranslationHostContext {
    TranslationHostContext::from_app(app, resource_dir, app_data)
}

struct GenerationRegistryCleanup {
    app: AppHandle,
    video_id: String,
}

impl Drop for GenerationRegistryCleanup {
    fn drop(&mut self) {
        self.app
            .state::<GenerationRegistry>()
            .remove(&self.video_id);
    }
}

pub fn generate_subtitles_background(
    app: AppHandle,
    app_data: PathBuf,
    video_id: String,
    video_path: PathBuf,
    target_language: String,
    source_language: String,
    output_format: String,
    model: String,
    regenerate: bool,
    mark_foreign_speech: bool,
    generation_mode: GenerationMode,
    prefer_external_subtitles: bool,
    show_sound_labels: bool,
    name_style: NameStyle,
    cancel_flag: Arc<AtomicBool>,
    resource_dir: Option<PathBuf>,
    translation_config: TranslationConfig,
    audio_stream_index: Option<usize>,
) {
    std::thread::spawn(move || {
        let _cleanup = GenerationRegistryCleanup {
            app: app.clone(),
            video_id: video_id.clone(),
        };
        emit_started(&app, &video_id);
        let result = generate_subtitles_sync(
            &app,
            &app_data,
            &video_id,
            &video_path,
            &target_language,
            &source_language,
            &output_format,
            &model,
            regenerate,
            mark_foreign_speech,
            generation_mode,
            prefer_external_subtitles,
            show_sound_labels,
            name_style,
            &cancel_flag,
            resource_dir.as_deref(),
            &translation_config,
            audio_stream_index,
        );
        if cancel_flag.load(Ordering::SeqCst) {
            emit_cancelled(&app, &video_id);
            return;
        }
        match result {
            Ok(path) => emit_completed(&app, &video_id, &path),
            Err(err) => {
                let diagnostics = resolve_video_cache_dir(&app_data, &video_path)
                    .ok()
                    .and_then(|cache_dir| {
                        locate_ffmpeg(resource_dir.as_deref()).ok().map(|paths| {
                            build_generation_failure_diagnostics(
                                &cache_dir,
                                &video_path,
                                &paths.ffprobe,
                                &err,
                                &model,
                                &target_language,
                                &source_language,
                            )
                        })
                    });
                if let (Some(cache_dir), Some(diag)) = (
                    resolve_video_cache_dir(&app_data, &video_path).ok(),
                    diagnostics.clone(),
                ) {
                    write_generation_failure_diagnostics(&cache_dir, &diag);
                }
                emit_failed(&app, &video_id, &err, diagnostics);
            }
        }
    });
}

fn save_recovered_partial(
    cache_dir: &Path,
    out_path: &Path,
    target_language: &str,
    format: SubtitleFormat,
    reason: &str,
    pipeline: &PipelineResult,
    cue_count: usize,
    speech_count: usize,
    coverage_until: f64,
) {
    let partial_path = partial_subtitle_path(cache_dir, target_language, format);
    let _ = std::fs::copy(out_path, &partial_path);
    let _ = std::fs::remove_file(out_path);

    let mut invalid_meta = pipeline.metadata.clone();
    invalid_meta.is_valid = false;
    invalid_meta.invalid_reason = Some(reason.to_string());
    invalid_meta.cue_count = cue_count;
    invalid_meta.speech_cue_count = speech_count;
    let _ = write_generation_sidecar(cache_dir, target_language, &invalid_meta);

    let recovered_meta_path =
        cache_dir.join(format!("generated.{target_language}.partial.meta.json"));
    let _ = std::fs::write(
        recovered_meta_path,
        serde_json::json!({
            "recoveredFromFailure": true,
            "invalidReason": reason,
            "cueCount": cue_count,
            "speechCueCount": speech_count,
            "coverageUntilSeconds": coverage_until,
            "targetLanguage": target_language,
        })
        .to_string(),
    );
}

fn write_generation_sidecar(
    cache_dir: &Path,
    target_language: &str,
    metadata: &GeneratedSubtitleMetadata,
) -> Result<(), String> {
    let path = cache_dir.join(format!("generated.{target_language}.meta.json"));
    let json = serde_json::to_string_pretty(metadata).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

fn source_language_mode(source_language: &str) -> &'static str {
    if source_language == "auto" || source_language.is_empty() {
        "auto"
    } else {
        "manual"
    }
}

fn generate_from_external(
    ffmpeg: &Path,
    video_path: &Path,
    video_key: &str,
    cache_dir: &Path,
    app_data: &Path,
    target_language: &str,
    source_language: &str,
    mark_foreign_speech: bool,
    show_sound_labels: bool,
    name_style: NameStyle,
    model: &str,
    translation_config: &TranslationConfig,
    format: SubtitleFormat,
    video_duration_sec: Option<f64>,
    translation_host: &TranslationHostContext,
) -> Result<PipelineResult, String> {
    let external = find_best_external_source(video_path, target_language)
        .ok_or_else(|| "no_external_subtitles".to_string())?;
    if external.kind == ExternalSourceKind::Translate
        && !translation_host.backend_available(translation_config)
    {
        return Err("unavailable_no_translation".to_string());
    }
    let cues = load_external_cues(ffmpeg, &external, cache_dir)?;
    let generation_method = match external.kind {
        ExternalSourceKind::Direct => GenerationMethod::ExternalDirect,
        ExternalSourceKind::Translate => GenerationMethod::ExternalTranslate,
    };
    finalize_generated_subtitles(
        cues,
        build_finalize_options(
            video_path,
            video_key,
            target_language,
            source_language,
            Some(external.language.clone()),
            mark_foreign_speech,
            show_sound_labels,
            name_style,
            model,
            "external-subtitles",
            generation_method,
            Some(external.path.to_string_lossy().to_string()),
            true,
            translation_config,
            app_data,
            format.as_str(),
            video_duration_sec,
            None,
            SpeakerColorMode::Auto,
            false,
            translation_host,
        ),
    )
}

fn offset_cue_times(cues: &mut [GeneratedSubtitleCue], offset: f64) {
    for cue in cues.iter_mut() {
        cue.start += offset;
        cue.end += offset;
    }
}

fn format_mm_ss(seconds: f64) -> String {
    let total = seconds.max(0.0) as u64;
    format!("{:02}:{:02}", total / 60, total % 60)
}

fn speech_coverage_until(cues: &[GeneratedSubtitleCue]) -> f64 {
    cues.iter()
        .filter(|c| !crate::services::subtitle_cue_quality::is_non_speech_cue(&c.text))
        .map(|c| c.end)
        .fold(0.0_f64, f64::max)
}

fn coverage_from_cues(
    cues: &[GeneratedSubtitleCue],
    duration_sec: Option<f64>,
    _contiguous_until: f64,
) -> (f64, f64, serde_json::Value) {
    let mut intervals: Vec<(f64, f64)> = cues
        .iter()
        .filter(|c| !crate::services::subtitle_cue_quality::is_non_speech_cue(&c.text))
        .filter(|c| c.end > c.start + 0.05 && c.start.is_finite() && c.end.is_finite())
        .map(|c| (c.start.max(0.0), c.end))
        .collect();
    intervals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut merged: Vec<(f64, f64)> = Vec::new();
    for (start, end) in intervals {
        if let Some(last) = merged.last_mut() {
            if start <= last.1 + 0.25 {
                last.1 = last.1.max(end);
                continue;
            }
        }
        merged.push((start, end));
    }

    let covered_seconds: f64 = merged.iter().map(|(s, e)| e - s).sum();
    let generated_until = merged.iter().map(|(_, e)| *e).fold(0.0_f64, f64::max);
    let coverage_ratio = duration_sec
        .filter(|d| *d > 0.0)
        .map(|d| (covered_seconds / d).min(1.0))
        .unwrap_or(0.0);

    let ranges: Vec<serde_json::Value> = merged
        .iter()
        .map(|(s, e)| {
            serde_json::json!({
                "start": s,
                "end": e,
                "status": "ready",
            })
        })
        .collect();

    (
        generated_until,
        coverage_ratio,
        serde_json::Value::Array(ranges),
    )
}

fn extract_wav_segment(
    ffmpeg: &Path,
    input_wav: &Path,
    output_wav: &Path,
    start_sec: f64,
    duration_sec: f64,
) -> Result<(), String> {
    let output = hidden_command(ffmpeg)
        .args([
            "-y",
            "-ss",
            &format!("{start_sec:.3}"),
            "-i",
            &input_wav.to_string_lossy(),
            "-t",
            &format!("{duration_sec:.3}"),
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            &output_wav.to_string_lossy(),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() || !output_wav.exists() {
        return Err("segment_extract_failed".to_string());
    }
    Ok(())
}

fn extract_audio_segment_from_video(
    ffmpeg: &Path,
    video_path: &Path,
    output_wav: &Path,
    audio_stream_index: usize,
    start_sec: f64,
    duration_sec: f64,
) -> Result<(), String> {
    let map_arg = format!("0:{audio_stream_index}");
    let output = hidden_command(ffmpeg)
        .args([
            "-y",
            "-ss",
            &format!("{start_sec:.3}"),
            "-i",
            &video_path.to_string_lossy(),
            "-t",
            &format!("{duration_sec:.3}"),
            "-map",
            &map_arg,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            &output_wav.to_string_lossy(),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() || !output_wav.exists() {
        return Err("segment_extract_failed".to_string());
    }
    Ok(())
}

fn partial_subtitle_path(
    cache_dir: &Path,
    target_language: &str,
    format: SubtitleFormat,
) -> PathBuf {
    cache_dir.join(format!(
        "generated.{target_language}.partial.{}",
        format.as_str()
    ))
}

fn write_partial_cues(
    cache_dir: &Path,
    target_language: &str,
    format: SubtitleFormat,
    cues: &[GeneratedSubtitleCue],
) -> Result<PathBuf, String> {
    let path = partial_subtitle_path(cache_dir, target_language, format);
    let body = write_vtt(cues);
    std::fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(path)
}

fn generate_from_audio(
    ffmpeg: &Path,
    _ffprobe: &Path,
    whisper: &Path,
    model_path: &Path,
    video_path: &Path,
    video_key: &str,
    cache_dir: &Path,
    audio_source: AudioSegmentSource<'_>,
    target_language: &str,
    source_language: &str,
    mark_foreign_speech: bool,
    show_sound_labels: bool,
    name_style: NameStyle,
    model: &str,
    format: SubtitleFormat,
    resource_dir: Option<&Path>,
    app_data: &Path,
    translation_config: &TranslationConfig,
    video_duration_sec: Option<f64>,
    translation_host: &TranslationHostContext,
    app: &AppHandle,
    video_id: &str,
    cancel_flag: &AtomicBool,
    runtime: &mut WhisperSessionRuntime,
) -> Result<PipelineResult, String> {
    let whisper_source = if source_language == "auto" || source_language.is_empty() {
        "auto"
    } else {
        source_language
    };
    let use_whisper_translate =
        should_whisper_translate_to_english(target_language, whisper_source);

    let wav_duration = if let Some(full_wav) = audio_source.full_wav {
        validate_extracted_wav(full_wav, video_duration_sec)?
    } else {
        video_duration_sec
            .filter(|duration| *duration > 0.0)
            .ok_or_else(|| "extracted_audio_invalid".to_string())?
    };

    let single_pass = uses_single_pass_whisper(wav_duration);
    let segment_seconds = if single_pass {
        wav_duration
    } else {
        segment_duration_for_video(wav_duration)
    };

    eprintln!(
        "[Virelia subtitles] generation backend={{backend: whisper.cpp, model: {model}, task: {}, sourceLanguage: {whisper_source}, targetLanguage: {target_language}, translateEnabled: {}, singlePass: {single_pass}, segmentSeconds: {segment_seconds:.0}, durationSec: {wav_duration:.1}, threads: {}, gpuMode: {}, gpuBackend: {}, gpuLayers: {}, inputMode: {}}}",
        if use_whisper_translate { "translate" } else { "transcribe" },
        translation_host.backend_available(translation_config) || use_whisper_translate,
        whisper_thread_count(),
        runtime.config.mode.as_str(),
        runtime.active_backend_label(),
        if runtime.plan.use_gpu {
            runtime.plan.gpu_layers
        } else {
            0
        },
        if audio_source.from_video { "video-segments" } else { "full-wav" }
    );

    let partial_path = partial_subtitle_path(cache_dir, target_language, format);
    let total_segments = if single_pass {
        1
    } else {
        ((wav_duration / segment_seconds).ceil() as usize).max(1)
    };
    let mut all_cues: Vec<GeneratedSubtitleCue> = Vec::new();
    let mut detected_lang: Option<String> = None;
    let ext = format.as_str();

    for seg_idx in 0..total_segments {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }
        let start = seg_idx as f64 * segment_seconds;
        let seg_dur = (wav_duration - start).min(segment_seconds);
        if seg_dur <= 0.05 {
            break;
        }

        let seg_label = format!("{}–{}", format_mm_ss(start), format_mm_ss(start + seg_dur));
        let progress_base = 0.35 + (seg_idx as f32 / total_segments as f32) * 0.45;
        emit_progress_detail(
            app,
            video_id,
            progress_base,
            &format!("transcribing segment {seg_label}"),
            serde_json::json!({
                "status": "transcribing",
                "currentSegmentStart": start,
                "currentSegmentEnd": start + seg_dur,
                "generatedCueCount": all_cues.len(),
                "generatedUntilSeconds": start,
                "contiguousFromStart": true,
            }),
        );

        let prefix = cache_dir.join(format!("whisper-seg-{seg_idx:04}"));
        let produced = if let Some(existing) = segment_output_exists(&prefix, ext) {
            existing
        } else {
            let seg_wav = cache_dir.join(format!("segment-{seg_idx:04}.wav"));
            if audio_source.from_video {
                extract_audio_segment_from_video(
                    ffmpeg,
                    audio_source.video_path,
                    &seg_wav,
                    audio_source.audio_stream_index,
                    start,
                    seg_dur,
                )?;
            } else if let Some(full_wav) = audio_source.full_wav {
                extract_wav_segment(ffmpeg, full_wav, &seg_wav, start, seg_dur)?;
            } else {
                return Err("segment_extract_failed".to_string());
            }

            if seg_idx == 0 {
                validate_extracted_wav(&seg_wav, Some(seg_dur))?;
            }

            let (produced_path, detected) = run_whisper_transcription(
                whisper,
                model_path,
                &seg_wav,
                whisper_source,
                &prefix,
                format,
                resource_dir,
                model,
                use_whisper_translate,
                runtime,
            )?;
            if detected_lang.is_none() {
                detected_lang = detected.clone();
            }
            let _ = std::fs::remove_file(&seg_wav);
            produced_path
        };

        let raw_subs = std::fs::read_to_string(&produced).map_err(|e| e.to_string())?;
        let mut cues = parse_subtitle_file_cues(&raw_subs, format.as_str());
        offset_cue_times(&mut cues, start);
        all_cues.extend(cues);

        let contiguous_until = start + seg_dur;
        let (generated_until, coverage_ratio, coverage_ranges) =
            coverage_from_cues(&all_cues, video_duration_sec, contiguous_until);
        let valid_cue_count = all_cues.iter().filter(|c| c.end > c.start + 0.05).count();

        let mut partial_cues = all_cues.clone();
        if let Err(err) = translate_cues_for_partial_preview(
            &mut partial_cues,
            video_path,
            target_language,
            whisper_source,
            detected_lang.as_deref(),
            use_whisper_translate,
            translation_config,
            translation_host,
            name_style,
        ) {
            eprintln!("[Virelia subtitles] partial translation skipped: {err}");
        }
        write_partial_cues(cache_dir, target_language, format, &partial_cues)?;

        emit_partial(
            app,
            video_id,
            &partial_path.to_string_lossy(),
            serde_json::json!({
                "generatedUntilSeconds": generated_until,
                "generatedCueCount": all_cues.len(),
                "validCueCount": valid_cue_count,
                "currentSegmentStart": start,
                "currentSegmentEnd": start + seg_dur,
                "coverageRatio": coverage_ratio,
                "coverageRanges": coverage_ranges,
                "contiguousFromStart": true,
                "rangeCount": coverage_ranges.as_array().map(|a| a.len()).unwrap_or(0),
                "status": "partial_ready",
                "backend": "whisper.cpp",
                "model": model,
                "targetLanguage": target_language,
            }),
        );

        let _ = std::fs::remove_file(&produced);
        for ext_name in ["srt", "vtt", "txt"] {
            let p = cache_dir.join(format!("whisper-seg-{seg_idx:04}.{ext_name}"));
            let _ = std::fs::remove_file(p);
        }
    }

    emit_progress(app, video_id, 0.82, "finalizing");

    let detected = if use_whisper_translate {
        Some("en".to_string())
    } else {
        detected_lang.or_else(|| {
            if whisper_source != "auto" {
                Some(whisper_source.to_string())
            } else {
                None
            }
        })
    };
    let generation_method = if use_whisper_translate {
        GenerationMethod::AudioTranscribeTranslate
    } else if detected
        .as_deref()
        .map(|lang| lang != "und" && lang != target_language)
        .unwrap_or(false)
    {
        GenerationMethod::AudioTranscribeTranslate
    } else {
        GenerationMethod::AudioTranscribe
    };

    finalize_generated_subtitles(
        all_cues,
        build_finalize_options(
            video_path,
            video_key,
            target_language,
            source_language,
            detected,
            mark_foreign_speech,
            show_sound_labels,
            name_style,
            model,
            "whisper.cpp",
            generation_method,
            None,
            true,
            translation_config,
            app_data,
            format.as_str(),
            video_duration_sec,
            None,
            SpeakerColorMode::Auto,
            use_whisper_translate,
            translation_host,
        ),
    )
}

fn save_pipeline_result(
    app: &AppHandle,
    video_id: &str,
    video_path: &Path,
    cache_dir: &Path,
    out_path: &Path,
    target_language: &str,
    model: &str,
    format: SubtitleFormat,
    mark_foreign_speech: bool,
    pipeline: PipelineResult,
    cancel_flag: &AtomicBool,
) -> Result<String, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }
    emit_progress(app, video_id, 0.85, "saving");
    std::fs::write(out_path, &pipeline.vtt)
        .map_err(|e| format!("Generated subtitles could not be saved: {e}"))?;

    let saved_raw = std::fs::read_to_string(out_path).map_err(|e| e.to_string())?;
    let parsed_cues = parse_subtitle_file_cues(&saved_raw, format.as_str());
    let parsed_count = parsed_cues.len();
    let coverage_error = if parsed_count == 0 {
        Some("parse-failed-after-generation".to_string())
    } else {
        use crate::services::subtitle_cue_quality::{analyze_cues, validate_generated_coverage};
        let stats = analyze_cues(&parsed_cues);
        validate_generated_coverage(
            &parsed_cues,
            &stats,
            pipeline.metadata.video_duration_sec,
            Some(saved_raw.len()),
        )
        .err()
    };

    if let Some(reason) = coverage_error {
        let speech_count = parsed_cues
            .iter()
            .filter(|c| !crate::services::subtitle_cue_quality::is_non_speech_cue(&c.text))
            .count();
        let coverage_until = speech_coverage_until(&parsed_cues);
        save_recovered_partial(
            cache_dir,
            out_path,
            target_language,
            format,
            &reason,
            &pipeline,
            parsed_count,
            speech_count,
            coverage_until,
        );
        return Err(reason);
    }

    if !pipeline.metadata.is_valid {
        let reason = pipeline
            .metadata
            .invalid_reason
            .clone()
            .unwrap_or_else(|| "generated_invalid".to_string());
        let speech_count = pipeline.metadata.speech_cue_count;
        let coverage_until = speech_coverage_until(&parsed_cues);
        if parsed_count > 0 && speech_count > 0 {
            save_recovered_partial(
                cache_dir,
                out_path,
                target_language,
                format,
                &reason,
                &pipeline,
                parsed_count,
                speech_count,
                coverage_until,
            );
        } else {
            let _ = std::fs::remove_file(out_path);
        }
        return Err(reason);
    }

    let partial_path = partial_subtitle_path(cache_dir, target_language, format);
    if partial_path.exists() {
        let _ = std::fs::remove_file(partial_path);
    }

    write_generation_sidecar(cache_dir, target_language, &pipeline.metadata)?;

    let (file_size, modified_at) =
        crate::services::subtitle_cache::video_file_fingerprint(video_path)?;
    let metadata = SubtitleCacheMetadata {
        video_path: video_path.to_string_lossy().to_string(),
        file_size,
        modified_at,
        language: target_language.to_string(),
        model: model.to_string(),
        format: format.as_str().to_string(),
        generated_at: pipeline.metadata.generated_at,
        duration: None,
        confidence: None,
        target_language: Some(target_language.to_string()),
        source_language_mode: Some(pipeline.metadata.source_language_mode.clone()),
        dominant_source_language: pipeline.metadata.dominant_source_language.clone(),
        detected_source_languages: pipeline.metadata.detected_source_languages.clone(),
        mark_foreign_speech: Some(mark_foreign_speech),
        is_translated: Some(pipeline.metadata.is_translated),
        backend: Some(pipeline.metadata.backend.clone()),
    };
    write_metadata(cache_dir, &metadata)
        .map_err(|e| format!("Generated subtitles could not be saved: {e}"))?;
    emit_progress(app, video_id, 1.0, "done");
    Ok(out_path.to_string_lossy().to_string())
}

fn generate_subtitles_sync(
    app: &AppHandle,
    app_data: &Path,
    video_id: &str,
    video_path: &Path,
    target_language: &str,
    source_language: &str,
    output_format: &str,
    model: &str,
    regenerate: bool,
    mark_foreign_speech: bool,
    generation_mode: GenerationMode,
    prefer_external_subtitles: bool,
    show_sound_labels: bool,
    name_style: NameStyle,
    cancel_flag: &AtomicBool,
    resource_dir: Option<&Path>,
    translation_config: &TranslationConfig,
    audio_stream_index: Option<usize>,
) -> Result<String, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    let translation_host = make_translation_host(app, resource_dir, app_data);

    let FfmpegPaths { ffmpeg, ffprobe } =
        locate_ffmpeg(resource_dir).map_err(|e: FfmpegError| e.to_string())?;

    let format = SubtitleFormat::from_extension(output_format).unwrap_or(SubtitleFormat::Vtt);

    let cache_dir = resolve_video_cache_dir(app_data, video_path)?;
    let out_path = generated_subtitle_path(&cache_dir, target_language, format);
    let video_key = media_id_for_path(video_path);
    let video_duration_sec = probe_video_duration(&ffprobe, video_path);

    if regenerate {
        crate::services::subtitle_cache::clear_generated_target(
            &cache_dir,
            target_language,
            format,
        )?;
    } else if out_path.exists()
        && crate::services::subtitle_cache::is_cache_valid(
            &cache_dir,
            video_path,
            target_language,
            model,
            format.as_str(),
        )
    {
        emit_progress(app, video_id, 1.0, "cached");
        return Ok(out_path.to_string_lossy().to_string());
    }

    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let try_external = |mode: GenerationMode| -> bool {
        matches!(
            mode,
            GenerationMode::Auto | GenerationMode::TranslateExisting
        ) && (prefer_external_subtitles || mode == GenerationMode::TranslateExisting)
    };

    if try_external(generation_mode) {
        emit_progress(app, video_id, 0.1, "loading external subtitles");
        match generate_from_external(
            &ffmpeg,
            video_path,
            &video_key,
            &cache_dir,
            app_data,
            target_language,
            source_language,
            mark_foreign_speech,
            show_sound_labels,
            name_style,
            model,
            translation_config,
            format,
            video_duration_sec,
            &translation_host,
        ) {
            Ok(pipeline) => {
                return save_pipeline_result(
                    app,
                    video_id,
                    video_path,
                    &cache_dir,
                    &out_path,
                    target_language,
                    model,
                    format,
                    mark_foreign_speech,
                    pipeline,
                    cancel_flag,
                );
            }
            Err(err) if generation_mode == GenerationMode::TranslateExisting => return Err(err),
            Err(ref err) if should_fallback_to_audio_generation(err) => {}
            Err(err) => return Err(err),
        }
    }

    if generation_mode == GenerationMode::TranslateExisting {
        return Err("no_external_subtitles".to_string());
    }

    if !has_audio_stream(&ffprobe, video_path) {
        return Err("No audio track found, subtitles cannot be generated.".to_string());
    }

    emit_progress(app, video_id, 0.05, "extracting audio");
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    let streams = probe_audio_streams(&ffprobe, video_path)?;
    let selected_stream = audio_stream_index
        .or_else(|| select_audio_stream(&streams, source_language))
        .ok_or_else(|| "No audio track found, subtitles cannot be generated.".to_string())?;

    let duration = video_duration_sec.unwrap_or(0.0);
    let single_pass = uses_single_pass_whisper(duration);
    let temp_wav = cache_dir.join("audio-extract.wav");

    let audio_source = if single_pass {
        extract_audio_wav(
            &ffmpeg,
            &ffprobe,
            video_path,
            &temp_wav,
            &cache_dir,
            source_language,
            Some(selected_stream),
        )?;
        AudioSegmentSource {
            full_wav: Some(&temp_wav),
            video_path,
            audio_stream_index: selected_stream,
            from_video: false,
        }
    } else {
        AudioSegmentSource {
            full_wav: None,
            video_path,
            audio_stream_index: selected_stream,
            from_video: true,
        }
    };

    emit_progress(app, video_id, 0.35, "transcribing");
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    let settings = crate::settings::load(app).unwrap_or_else(|_| serde_json::json!({}));
    let gpu_config = load_whisper_gpu_config(&settings);

    let whisper = locate_whisper_cli_for_generation(resource_dir, &gpu_config).ok_or_else(|| {
        "Subtitle generation backend is not configured. Install whisper.cpp and add a ggml model."
            .to_string()
    })?;
    let gpu_capabilities = probe_whisper_gpu_capabilities(&whisper);
    let mut whisper_runtime = WhisperSessionRuntime::new(gpu_config, gpu_capabilities);
    let model_path = locate_whisper_model_with_app_data(model, resource_dir, Some(app_data))
        .ok_or_else(|| format!("unavailable_no_model: Missing or incomplete ggml-{model}.bin model."))?;

    let pipeline = generate_from_audio(
        &ffmpeg,
        &ffprobe,
        &whisper,
        &model_path,
        video_path,
        &video_key,
        &cache_dir,
        audio_source,
        target_language,
        source_language,
        mark_foreign_speech,
        show_sound_labels,
        name_style,
        model,
        format,
        resource_dir,
        app_data,
        translation_config,
        video_duration_sec,
        &translation_host,
        app,
        video_id,
        cancel_flag,
        &mut whisper_runtime,
    )?;

    if single_pass {
        let _ = std::fs::remove_file(&temp_wav);
    }
    save_pipeline_result(
        app,
        video_id,
        video_path,
        &cache_dir,
        &out_path,
        target_language,
        model,
        format,
        mark_foreign_speech,
        pipeline,
        cancel_flag,
    )
}

pub fn translate_existing_subtitles_background(
    app: AppHandle,
    app_data: PathBuf,
    video_id: String,
    video_path: PathBuf,
    source_subtitle_path: PathBuf,
    source_language: String,
    target_language: String,
    output_format: String,
    franchise_key: Option<String>,
    mark_foreign_speech: bool,
    show_sound_labels: bool,
    name_style: NameStyle,
    speaker_color_mode: SpeakerColorMode,
    translation_config: TranslationConfig,
    cancel_flag: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let _cleanup = GenerationRegistryCleanup {
            app: app.clone(),
            video_id: video_id.clone(),
        };
        emit_started(&app, &video_id);
        let result = run_translate_existing_subtitles(
            &app,
            &app_data,
            &video_id,
            &video_path,
            &source_subtitle_path,
            &source_language,
            &target_language,
            &output_format,
            franchise_key.as_deref(),
            mark_foreign_speech,
            show_sound_labels,
            name_style,
            speaker_color_mode,
            &translation_config,
            &cancel_flag,
        );
        match result {
            Ok(path) => emit_completed(&app, &video_id, &path),
            Err(err) if err == "cancelled" => {
                let _ = app.emit(
                    "subtitle-generation-cancelled",
                    serde_json::json!({ "videoId": video_id }),
                );
            }
            Err(err) => emit_failed(&app, &video_id, &err, None),
        }
    });
}

fn run_translate_existing_subtitles(
    app: &AppHandle,
    app_data: &Path,
    video_id: &str,
    video_path: &Path,
    source_subtitle_path: &Path,
    source_language: &str,
    target_language: &str,
    output_format: &str,
    franchise_key: Option<&str>,
    mark_foreign_speech: bool,
    show_sound_labels: bool,
    name_style: NameStyle,
    speaker_color_mode: SpeakerColorMode,
    translation_config: &TranslationConfig,
    cancel_flag: &AtomicBool,
) -> Result<String, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }
    let resource_dir = app.path().resource_dir().ok();
    let translation_host = make_translation_host(app, resource_dir.as_deref(), app_data);
    if !translation_host.backend_available(translation_config) {
        return Err("unavailable_no_translation".to_string());
    }
    if !source_subtitle_path.is_file() {
        return Err("Source subtitle file not found.".to_string());
    }

    let ffmpeg_paths =
        locate_ffmpeg(app.path().resource_dir().ok().as_deref()).map_err(|e| e.to_string())?;
    let ffprobe = ffmpeg_paths.ffprobe;
    let ffmpeg = ffmpeg_paths.ffmpeg;

    let format = SubtitleFormat::from_extension(
        source_subtitle_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("ass"),
    )
    .unwrap_or(SubtitleFormat::Ass);

    let detected_lang = if source_language == "auto" || source_language.is_empty() {
        detect_subtitle_language(source_subtitle_path).code
    } else {
        source_language.to_string()
    };

    let cache_dir = resolve_video_cache_dir(app_data, video_path)?;
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let out_format = SubtitleFormat::from_extension(output_format).unwrap_or(SubtitleFormat::Vtt);
    let out_path = generated_subtitle_path(&cache_dir, target_language, out_format);
    let video_key = media_id_for_path(video_path);
    let video_duration_sec = probe_video_duration(&ffprobe, video_path);

    emit_progress(app, video_id, 0.05, "loading source subtitles");

    let external = ExternalSubtitleSource {
        path: source_subtitle_path.to_path_buf(),
        language: detected_lang.clone(),
        format,
        kind: ExternalSourceKind::Translate,
        label: source_subtitle_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("external")
            .to_string(),
    };
    let mut cues = load_external_cues(&ffmpeg, &external, &cache_dir)?;
    if cues.is_empty() {
        return Err("Source subtitles contain no cues.".to_string());
    }

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    let franchise = detect_franchise(video_path, franchise_key);
    let dominant = detect_dominant_speech_language(&cues).unwrap_or(detected_lang.clone());
    let source_lang = if source_language == "auto" || source_language.is_empty() {
        dominant.clone()
    } else {
        source_language.to_string()
    };

    if source_lang == target_language {
        return Err("Source and target languages are the same.".to_string());
    }

    emit_progress(app, video_id, 0.1, "translating existing subtitles");
    let app_for_progress = app.clone();
    let video_id_for_progress = video_id.to_string();
    translate_cues_in_batches(
        &mut cues,
        &source_lang,
        target_language,
        translation_config,
        franchise.as_ref(),
        name_style,
        |done, total| {
            let progress = if total == 0 {
                0.1
            } else {
                0.1 + (done as f32 / total as f32) * 0.7
            };
            emit_progress(
                &app_for_progress,
                &video_id_for_progress,
                progress,
                &format!("translated {done}/{total} cues"),
            );
        },
        Some(&translation_host),
    )?;

    if cancel_flag.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    emit_progress(app, video_id, 0.85, "finalizing translated subtitles");
    let pipeline = finalize_generated_subtitles(
        cues,
        build_finalize_options(
            video_path,
            &video_key,
            target_language,
            source_language,
            Some(detected_lang),
            mark_foreign_speech,
            show_sound_labels,
            name_style,
            "translation",
            translation_config.backend.as_str(),
            GenerationMethod::ExternalTranslate,
            Some(source_subtitle_path.to_string_lossy().to_string()),
            false,
            translation_config,
            app_data,
            output_format,
            video_duration_sec,
            franchise_key,
            speaker_color_mode,
            true,
            &translation_host,
        ),
    )?;

    save_pipeline_result(
        app,
        video_id,
        video_path,
        &cache_dir,
        &out_path,
        target_language,
        "translation",
        out_format,
        mark_foreign_speech,
        pipeline,
        cancel_flag,
    )
}

#[cfg(test)]
mod whisper_model_tests {
    use super::*;

    #[test]
    fn matches_quantized_model_filenames() {
        assert!(whisper_model_filename_matches(
            "ggml-small-q5_0.bin",
            "small"
        ));
        assert!(whisper_model_filename_matches(
            "ggml-large-v3.bin",
            "large-v3"
        ));
        assert!(!whisper_model_filename_matches(
            "ggml-small-q5_0.bin",
            "base"
        ));
    }

    #[test]
    fn parses_model_id_from_filename() {
        assert_eq!(
            whisper_model_id_from_filename("ggml-base.bin"),
            Some("base".to_string())
        );
        assert_eq!(
            whisper_model_id_from_filename("ggml-small-q5_0.bin"),
            Some("small".to_string())
        );
        assert_eq!(
            whisper_model_id_from_filename("ggml-large-v3-turbo.bin"),
            Some("large-v3-turbo".to_string())
        );
    }

    #[test]
    fn whisper_language_defaults_to_auto() {
        assert_eq!(whisper_language_arg("auto"), "auto");
        assert_eq!(whisper_language_arg("und"), "auto");
        assert_eq!(whisper_language_arg(""), "auto");
        assert_eq!(whisper_language_arg("ja"), "ja");
    }

    #[test]
    fn medium_model_requires_minimum_size() {
        assert!(minimum_whisper_model_bytes("medium") >= 350_000_000);
        assert!(minimum_whisper_model_bytes("base") < minimum_whisper_model_bytes("medium"));
    }

    #[test]
    fn selects_japanese_stream_when_source_is_ja() {
        let streams = vec![
            AudioStreamInfo {
                index: 0,
                is_default: true,
                language: Some("rus".to_string()),
                title: Some("AniDUB".to_string()),
                codec: Some("aac".to_string()),
                channels: Some(2),
                sample_rate: Some(48_000),
            },
            AudioStreamInfo {
                index: 1,
                is_default: false,
                language: Some("jpn".to_string()),
                title: Some("Original".to_string()),
                codec: Some("flac".to_string()),
                channels: Some(2),
                sample_rate: Some(48_000),
            },
        ];
        assert_eq!(select_audio_stream(&streams, "ja"), Some(1));
        assert_eq!(select_audio_stream(&streams, "auto"), Some(1));
    }

    #[test]
    fn external_errors_only_fallback_when_no_subtitles() {
        assert!(should_fallback_to_audio_generation("no_external_subtitles"));
        assert!(should_fallback_to_audio_generation(
            "External subtitle file contains no cues."
        ));
        assert!(!should_fallback_to_audio_generation("unavailable_no_translation"));
    }

    #[test]
    fn parses_whisper_output_path_from_stderr() {
        let stderr = b"whisper_print_progress_callback: progress = 100%\noutput_vtt: saving output to 'C:\\cache\\whisper-seg-0000.vtt'\n";
        let parsed = parse_whisper_output_path_from_stderr(stderr);
        assert_eq!(
            parsed,
            Some(PathBuf::from("C:\\cache\\whisper-seg-0000.vtt"))
        );
    }

    #[test]
    fn whisper_translate_flag_when_target_en() {
        assert!(should_whisper_translate_to_english("en", "ja"));
        assert!(should_whisper_translate_to_english("en", "auto"));
        assert!(!should_whisper_translate_to_english("en", "en"));
        assert!(!should_whisper_translate_to_english("ru", "ja"));
    }

    #[test]
    fn single_pass_only_for_short_clips() {
        assert!(uses_single_pass_whisper(45.0));
        assert!(!uses_single_pass_whisper(8.0 * 60.0));
        assert!(!uses_single_pass_whisper(23.0 * 60.0));
    }

    #[test]
    fn progressive_segment_duration_is_one_minute() {
        assert_eq!(segment_duration_for_video(24.0 * 60.0), 60.0);
        assert_eq!(segment_duration_for_video(90.0 * 60.0), 60.0);
        assert_eq!(segment_duration_for_video(150.0 * 60.0), 60.0);
    }
}
