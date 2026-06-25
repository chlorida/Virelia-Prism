use super::ExternalSubtitleIndexEntry;
use super::MediaItem;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedMediaEntry {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub items: Vec<MediaItem>,
    pub added: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
    #[serde(default)]
    pub subtitle_index: HashMap<String, Vec<ExternalSubtitleIndexEntry>>,
    #[serde(default)]
    pub skipped_items: Vec<SkippedMediaEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub current_path: String,
    pub scanned: u64,
    pub added: u64,
    pub skipped: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    pub done: bool,
}

/// Payload for `library-changed` (matches renderer `LibraryScanResult`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChangedPayload {
    pub folders: Vec<String>,
    pub media: Vec<MediaItem>,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFoldersResult {
    pub enabled: bool,
    pub message: String,
}
