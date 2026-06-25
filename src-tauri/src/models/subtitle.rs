use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubtitleSource {
    Embedded,
    External,
    Generated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubtitleFormat {
    Srt,
    Vtt,
    Ass,
    Ssa,
}

impl SubtitleFormat {
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.trim_start_matches('.').to_lowercase().as_str() {
            "srt" => Some(Self::Srt),
            "vtt" => Some(Self::Vtt),
            "ass" => Some(Self::Ass),
            "ssa" => Some(Self::Ssa),
            "sub" => Some(Self::Srt),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Srt => "srt",
            Self::Vtt => "vtt",
            Self::Ass => "ass",
            Self::Ssa => "ssa",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub id: String,
    pub video_id: String,
    pub video_path: String,
    pub video_key: String,
    pub source: SubtitleSource,
    pub language: String,
    pub language_label: String,
    pub label: String,
    pub format: SubtitleFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedded_track_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_valid: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_invalid_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_pipeline_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_partial: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_live_updating: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generated_until_seconds: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovered_from_failure: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleCacheMetadata {
    pub video_path: String,
    pub file_size: u64,
    pub modified_at: u64,
    /// Target subtitle language (output).
    pub language: String,
    pub model: String,
    pub format: String,
    pub generated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_language_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dominant_source_language: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub detected_source_languages: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mark_foreign_speech: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_translated: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSubtitleIndexEntry {
    pub path: String,
    pub language: String,
    pub format: SubtitleFormat,
    pub label: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleLibraryIndex {
    /// video media id -> external subtitle files discovered during library scan
    pub by_video_id: std::collections::HashMap<String, Vec<ExternalSubtitleIndexEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverSubtitlesResult {
    pub tracks: Vec<SubtitleTrack>,
    #[serde(default)]
    pub debug: Option<SubtitleDiscoveryDebug>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleDiscoveryDebug {
    pub video_path: String,
    pub searched_dirs: Vec<String>,
    pub candidates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoAudioStream {
    pub index: usize,
    pub is_default: bool,
    pub language: Option<String>,
    pub title: Option<String>,
    pub codec: Option<String>,
    pub channels: Option<u32>,
    pub sample_rate: Option<u32>,
    pub label: String,
    pub is_commentary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleGenerationDiagnostics {
    pub reason: String,
    pub message: String,
    pub video_duration_sec: Option<f64>,
    pub generated_cue_count: Option<usize>,
    pub coverage_ratio: Option<f64>,
    pub selected_audio_stream: Option<String>,
    pub audio_language: Option<String>,
    pub audio_duration_sec: Option<f64>,
    pub extracted_audio_bytes: Option<u64>,
    pub transcription_backend: String,
    pub model_name: String,
    pub source_language_mode: String,
    pub target_language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovered_cue_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coverage_until_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleGenerationAvailability {
    pub can_generate: bool,
    pub ffmpeg_available: bool,
    pub whisper_cli_available: bool,
    pub whisper_model_available: bool,
    pub whisper_model_name: String,
    pub whisper_available: bool,
    pub ffmpeg_path: Option<String>,
    pub whisper_cli_path: Option<String>,
    pub whisper_model_path: Option<String>,
    pub whisper_model_hint: Option<String>,
    pub translation_available: bool,
    pub whisper_gpu_mode: String,
    pub whisper_gpu_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub whisper_gpu_backend: Option<String>,
    pub whisper_gpu_layers: u32,
    /// ready | unavailable_no_ffmpeg | unavailable_no_backend | unavailable_no_model
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateExistingSubtitlesRequest {
    pub video_id: String,
    pub video_path: String,
    pub source_subtitle_path: String,
    pub source_language: String,
    pub target_language: String,
    #[serde(default)]
    pub output_format: Option<String>,
    #[serde(default)]
    pub franchise_key: Option<String>,
    #[serde(default)]
    pub preserve_styles: Option<bool>,
    #[serde(default)]
    pub preserve_speaker_metadata: Option<bool>,
    #[serde(default)]
    pub mark_foreign_speech: Option<bool>,
    #[serde(default)]
    pub show_sound_labels: Option<bool>,
    #[serde(default)]
    pub speaker_color_mode: Option<String>,
    #[serde(default)]
    pub name_style: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateSubtitlesRequest {
    pub video_path: String,
    pub source_subtitle_track_id: String,
    #[serde(default)]
    pub source_subtitle_path: Option<String>,
    pub source_language: String,
    pub target_language: String,
    #[serde(default)]
    pub franchise_key: Option<String>,
    #[serde(default)]
    pub preserve_honorifics: Option<bool>,
    #[serde(default)]
    pub mark_foreign_speech: Option<bool>,
    #[serde(default)]
    pub speaker_color_mode: Option<String>,
    #[serde(default)]
    pub output_format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCharacterColorRequest {
    pub franchise_key: Option<String>,
    pub video_key: String,
    pub video_path: Option<String>,
    pub character_name: Option<String>,
    pub speaker_id: Option<String>,
    #[serde(default)]
    pub context: GetCharacterColorContext,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCharacterColorContext {
    #[serde(default)]
    pub cue_times: Vec<f64>,
    pub subtitle_style_name: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCharacterColorResponse {
    pub color: String,
    pub outline_color: String,
    pub source: String,
    pub confidence: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCharacterColorOverrideRequest {
    pub franchise_key: Option<String>,
    pub video_key: Option<String>,
    pub character_name: String,
    pub color: String,
    pub outline_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCharacterColorOverrideResponse {
    pub color: String,
    pub outline_color: String,
    pub source: String,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetCharacterColorRequest {
    pub franchise_key: Option<String>,
    pub video_key: Option<String>,
    pub character_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateSubtitlesResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    pub target_language: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_language: Option<String>,
    pub cue_count: usize,
    pub translated_cue_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_speakers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_glossary: Option<String>,
    pub used_character_colors: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
