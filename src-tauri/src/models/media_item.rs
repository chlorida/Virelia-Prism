use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Audio,
    Video,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub title: String,
    pub folder: String,
    pub extension: String,
    pub kind: MediaKind,
    pub size: u64,
    #[serde(rename = "mtimeMs", skip_serializing_if = "Option::is_none")]
    pub mtime_ms: Option<u64>,
    #[serde(rename = "addedAt")]
    pub modified_at: String,
    #[serde(rename = "durationSeconds", skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_label: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<MediaKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
