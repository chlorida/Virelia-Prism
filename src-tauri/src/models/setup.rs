use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupResourceStatus {
    pub ffmpeg_available: bool,
    pub whisper_cli_available: bool,
    pub installed_models: Vec<String>,
    pub ffmpeg_path: Option<String>,
    pub whisper_cli_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupBenchmark {
    pub elapsed_ms: u128,
    pub thread_count: usize,
    pub score: f64,
    pub tier: String,
    pub confidence: f64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupModelCandidate {
    pub id: String,
    pub friendly_label: String,
    pub short_label: String,
    pub description: String,
    pub technical_detail: String,
    pub expected_file_name: String,
    pub download_url: String,
    pub estimated_size_mb: u32,
    pub installed: bool,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupRecommendation {
    pub model_id: String,
    pub friendly_label: String,
    pub reason: String,
    pub confidence: f64,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunSetupBenchmarkResult {
    pub benchmark: SetupBenchmark,
    pub resources: SetupResourceStatus,
    pub models: Vec<SetupModelCandidate>,
    pub recommendation: SetupRecommendation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupDownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub progress: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupDownloadResult {
    pub model_id: String,
    pub file_path: String,
    pub bytes: u64,
    pub already_installed: bool,
}
