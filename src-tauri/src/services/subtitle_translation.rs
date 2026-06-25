use crate::services::builtin_translation::{
    self, builtin_translate_url, ensure_builtin_translation_server, BuiltinTranslationRuntime,
};
use crate::services::subtitle_cue::GeneratedSubtitleCue;
use crate::services::subtitle_cue_quality::is_non_speech_cue;
use crate::services::subtitle_glossary::NameStyle;
use crate::services::subtitle_language::{count_script_chars, normalize_metadata_language};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TranslationBackendKind {
    Disabled,
    Builtin,
    Mock,
    LocalCommand,
    LocalHttp,
    CustomApi,
}

impl TranslationBackendKind {
    pub fn from_settings_value(raw: &str) -> Self {
        match raw.to_lowercase().as_str() {
            "builtin" | "built-in" | "embedded" => Self::Builtin,
            "mock" => Self::Mock,
            "local-command" | "local_command" | "command" => Self::LocalCommand,
            "local-http" | "local_http" | "http" => Self::LocalHttp,
            "custom-api" | "custom_api" | "api" => Self::CustomApi,
            _ => Self::Disabled,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Builtin => "builtin",
            Self::Mock => "mock",
            Self::LocalCommand => "local-command",
            Self::LocalHttp => "local-http",
            Self::CustomApi => "custom-api",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationConfig {
    pub backend: TranslationBackendKind,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub http_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
}

impl Default for TranslationConfig {
    fn default() -> Self {
        Self {
            backend: TranslationBackendKind::Disabled,
            command: None,
            http_url: None,
            api_key: None,
        }
    }
}

pub fn load_translation_config(settings: &Value) -> TranslationConfig {
    if std::env::var("VIRELIA_TRANSLATION_BACKEND")
        .map(|v| v.eq_ignore_ascii_case("mock"))
        .unwrap_or(false)
    {
        return TranslationConfig {
            backend: TranslationBackendKind::Mock,
            ..Default::default()
        };
    }
    let subtitles = settings.get("subtitles").cloned().unwrap_or(Value::Null);
    let translation = subtitles.get("translation").cloned().unwrap_or(Value::Null);
    let backend = translation
        .get("backend")
        .and_then(|v| v.as_str())
        .map(TranslationBackendKind::from_settings_value)
        .unwrap_or(TranslationBackendKind::Builtin);
    TranslationConfig {
        backend,
        command: translation
            .get("command")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        http_url: translation
            .get("httpUrl")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        api_key: translation
            .get("apiKey")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    }
}

pub fn translation_backend_available(config: &TranslationConfig) -> bool {
    translation_backend_available_at(config, None, None)
}

pub fn translation_backend_available_at(
    config: &TranslationConfig,
    resource_dir: Option<&Path>,
    app_data: Option<&Path>,
) -> bool {
    match config.backend {
        TranslationBackendKind::Disabled => false,
        TranslationBackendKind::Builtin => {
            builtin_translation::is_builtin_translation_healthy()
                || builtin_translation::is_builtin_translation_installed(resource_dir, app_data)
        }
        TranslationBackendKind::Mock => true,
        TranslationBackendKind::LocalCommand => config
            .command
            .as_ref()
            .map(|c| !c.trim().is_empty())
            .unwrap_or(false),
        TranslationBackendKind::LocalHttp | TranslationBackendKind::CustomApi => config
            .http_url
            .as_ref()
            .map(|u| !u.trim().is_empty())
            .unwrap_or(false),
    }
}

#[derive(Clone)]
pub struct TranslationHostContext {
    pub app: Option<AppHandle>,
    pub resource_dir: Option<PathBuf>,
    pub app_data: Option<PathBuf>,
}

impl TranslationHostContext {
    pub fn from_app(app: &AppHandle, resource_dir: Option<&Path>, app_data: &Path) -> Self {
        Self {
            app: Some(app.clone()),
            resource_dir: resource_dir.map(Path::to_path_buf),
            app_data: Some(app_data.to_path_buf()),
        }
    }

    pub fn backend_available(&self, config: &TranslationConfig) -> bool {
        translation_backend_available_at(
            config,
            self.resource_dir.as_deref(),
            self.app_data.as_deref(),
        )
    }

    fn ensure_builtin_ready(&self, config: &TranslationConfig) -> Result<(), String> {
        if config.backend != TranslationBackendKind::Builtin {
            return Ok(());
        }
        let app = self
            .app
            .as_ref()
            .ok_or_else(|| "builtin_translation_runtime_missing".to_string())?;
        let runtime = app.state::<BuiltinTranslationRuntime>();
        ensure_builtin_translation_server(
            &runtime,
            self.resource_dir.as_deref(),
            self.app_data.as_deref(),
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationCue {
    pub id: String,
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationGlossary {
    pub franchise_key: Option<String>,
    pub terms: HashMap<String, String>,
    pub character_names: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationContext {
    pub preserve_honorifics: bool,
    pub target_language: String,
    pub name_style: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationBatchRequest {
    pub source_language: String,
    pub target_language: String,
    pub cues: Vec<TranslationCue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glossary: Option<TranslationGlossary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<TranslationContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationBatchResult {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationBatchResponse {
    #[serde(default)]
    pub results: Vec<TranslationBatchResult>,
    #[serde(default)]
    pub translations: Vec<TranslationBatchResult>,
}

impl TranslationBatchResponse {
    pub fn entries(&self) -> &[TranslationBatchResult] {
        if !self.results.is_empty() {
            &self.results
        } else {
            &self.translations
        }
    }
}

pub trait TranslationBackend {
    fn translate_batch(
        &self,
        request: &TranslationBatchRequest,
    ) -> Result<TranslationBatchResponse, String>;
}

pub struct MockTranslationBackend;

impl TranslationBackend for MockTranslationBackend {
    fn translate_batch(
        &self,
        request: &TranslationBatchRequest,
    ) -> Result<TranslationBatchResponse, String> {
        let results = request
            .cues
            .iter()
            .map(|cue| {
                let text = if is_non_speech_cue(&cue.text) {
                    cue.text.clone()
                } else if request.target_language == "ru" {
                    format!("Перевод: {}", cue.text)
                } else {
                    format!("[{}] {}", request.target_language, cue.text)
                };
                TranslationBatchResult {
                    id: cue.id.clone(),
                    text,
                }
            })
            .collect();
        Ok(TranslationBatchResponse {
            results,
            translations: Vec::new(),
        })
    }
}

pub struct ExternalCommandTranslationBackend {
    pub command: String,
}

impl TranslationBackend for ExternalCommandTranslationBackend {
    fn translate_batch(
        &self,
        request: &TranslationBatchRequest,
    ) -> Result<TranslationBatchResponse, String> {
        let input = serde_json::to_string(request).map_err(|e| e.to_string())?;
        let mut cmd = if cfg!(windows) {
            let mut c = crate::services::process_util::hidden_command("cmd");
            c.args(["/C", &self.command]);
            c
        } else {
            let mut c = crate::services::process_util::hidden_command("sh");
            c.args(["-c", &self.command]);
            c
        };
        use std::io::Write;
        let mut child = cmd
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run translation command: {e}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(input.as_bytes())
                .map_err(|e| e.to_string())?;
        }
        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Translation command failed: {err}"));
        }
        serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Invalid translation output: {e}"))
    }
}

pub struct HttpTranslationBackend {
    pub url: String,
    pub api_key: Option<String>,
}

fn libretranslate_language(code: &str) -> String {
    let normalized = normalize_metadata_language(code);
    if normalized.code == "und" || normalized.code.is_empty() {
        "auto".to_string()
    } else {
        normalized.code
    }
}

fn is_libretranslate_endpoint(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    if lower.contains("libretranslate") {
        return true;
    }
    if lower.ends_with("/translate") && !lower.contains("batch") {
        return true;
    }
    (lower.contains(":5000") || lower.contains(":5001"))
        && !lower.contains("/batch")
        && !lower.contains("virelia")
}

fn libretranslate_endpoint(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.ends_with("/translate") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/translate")
    }
}

#[derive(Debug, Deserialize)]
struct LibreTranslateResponse {
    #[serde(default, alias = "translatedText")]
    translated_text: Option<Value>,
}

impl LibreTranslateResponse {
    fn texts(self) -> Result<Vec<String>, String> {
        let payload = self
            .translated_text
            .ok_or_else(|| "LibreTranslate response missing translatedText.".to_string())?;
        match payload {
            Value::String(text) => Ok(vec![text]),
            Value::Array(items) => items
                .into_iter()
                .map(|item| {
                    item.as_str()
                        .map(str::to_string)
                        .ok_or_else(|| "LibreTranslate returned a non-text translation.".to_string())
                })
                .collect(),
            _ => Err("LibreTranslate returned an unexpected translatedText shape.".to_string()),
        }
    }
}

pub struct LibreTranslateBackend {
    pub endpoint: String,
    pub api_key: Option<String>,
}

impl TranslationBackend for LibreTranslateBackend {
    fn translate_batch(
        &self,
        request: &TranslationBatchRequest,
    ) -> Result<TranslationBatchResponse, String> {
        if request.cues.is_empty() {
            return Err("LibreTranslate batch contained no cues.".to_string());
        }
        let source = libretranslate_language(&request.source_language);
        let target = libretranslate_language(&request.target_language);
        let texts: Vec<&str> = request.cues.iter().map(|cue| cue.text.as_str()).collect();
        let mut body = serde_json::json!({
            "q": texts,
            "source": source,
            "target": target,
            "format": "text",
        });
        if let Some(key) = self.api_key.as_ref().filter(|k| !k.trim().is_empty()) {
            body["api_key"] = Value::String(key.clone());
        }
        let req = ureq::post(&self.endpoint)
            .set("Content-Type", "application/json; charset=utf-8")
            .timeout(std::time::Duration::from_secs(180));
        let response = req
            .send_json(body)
            .map_err(|e| format!("LibreTranslate request failed: {e}"))?;
        if response.status() < 200 || response.status() >= 300 {
            let status = response.status();
            let err_body = response.into_string().unwrap_or_default();
            return Err(format!("LibreTranslate failed ({status}): {err_body}"));
        }
        let parsed: LibreTranslateResponse = response
            .into_json()
            .map_err(|e| format!("Invalid LibreTranslate response: {e}"))?;
        let translated = parsed.texts()?;
        if translated.len() != request.cues.len() {
            return Err(format!(
                "LibreTranslate returned {} lines for {} cues.",
                translated.len(),
                request.cues.len()
            ));
        }
        let results = request
            .cues
            .iter()
            .zip(translated)
            .map(|(cue, text)| TranslationBatchResult {
                id: cue.id.clone(),
                text,
            })
            .collect();
        Ok(TranslationBatchResponse {
            results,
            translations: Vec::new(),
        })
    }
}

impl TranslationBackend for HttpTranslationBackend {
    fn translate_batch(
        &self,
        request: &TranslationBatchRequest,
    ) -> Result<TranslationBatchResponse, String> {
        let body = serde_json::to_value(request).map_err(|e| e.to_string())?;
        let mut req = ureq::post(&self.url)
            .set("Content-Type", "application/json; charset=utf-8")
            .timeout(std::time::Duration::from_secs(120));
        if let Some(key) = self.api_key.as_ref().filter(|k| !k.trim().is_empty()) {
            req = req.set("Authorization", &format!("Bearer {key}"));
        }
        let response = req
            .send_json(body)
            .map_err(|e| format!("HTTP translation request failed: {e}"))?;
        if response.status() < 200 || response.status() >= 300 {
            let status = response.status();
            let err_body = response.into_string().unwrap_or_default();
            return Err(format!("HTTP translation failed ({status}): {err_body}"));
        }
        let parsed: TranslationBatchResponse = response
            .into_json()
            .map_err(|e| format!("Invalid HTTP translation response: {e}"))?;
        if parsed.entries().is_empty() {
            return Err("HTTP translation response contained no translations.".to_string());
        }
        Ok(parsed)
    }
}

pub fn create_backend(
    config: &TranslationConfig,
    host: Option<&TranslationHostContext>,
) -> Result<Box<dyn TranslationBackend>, String> {
    match config.backend {
        TranslationBackendKind::Disabled => Err("Translation backend is disabled.".to_string()),
        TranslationBackendKind::Builtin => {
            let host = host.ok_or_else(|| "builtin_translation_runtime_missing".to_string())?;
            host.ensure_builtin_ready(config)?;
            Ok(Box::new(LibreTranslateBackend {
                endpoint: builtin_translate_url(),
                api_key: None,
            }))
        }
        TranslationBackendKind::Mock => Ok(Box::new(MockTranslationBackend)),
        TranslationBackendKind::LocalCommand => {
            let command = config
                .command
                .clone()
                .filter(|c| !c.trim().is_empty())
                .ok_or_else(|| {
                    "Local command translation backend is not configured.".to_string()
                })?;
            Ok(Box::new(ExternalCommandTranslationBackend { command }))
        }
        TranslationBackendKind::LocalHttp => {
            let url = config
                .http_url
                .clone()
                .filter(|u| !u.trim().is_empty())
                .ok_or_else(|| "HTTP translation backend URL is not configured.".to_string())?;
            if is_libretranslate_endpoint(&url) {
                Ok(Box::new(LibreTranslateBackend {
                    endpoint: libretranslate_endpoint(&url),
                    api_key: config.api_key.clone(),
                }))
            } else {
                Ok(Box::new(HttpTranslationBackend {
                    url,
                    api_key: config.api_key.clone(),
                }))
            }
        }
        TranslationBackendKind::CustomApi => {
            let url = config
                .http_url
                .clone()
                .filter(|u| !u.trim().is_empty())
                .ok_or_else(|| "HTTP translation backend URL is not configured.".to_string())?;
            Ok(Box::new(HttpTranslationBackend {
                url,
                api_key: config.api_key.clone(),
            }))
        }
    }
}

pub fn build_translation_batch_request(
    cues: &[GeneratedSubtitleCue],
    source_language: &str,
    target_language: &str,
    glossary: Option<TranslationGlossary>,
    context: Option<TranslationContext>,
) -> TranslationBatchRequest {
    let speech_indices: Vec<usize> = cues
        .iter()
        .enumerate()
        .filter(|(_, c)| !is_non_speech_cue(&c.text))
        .map(|(i, _)| i)
        .collect();
    let mut translation_cues = Vec::new();
    for (pos, idx) in speech_indices.iter().enumerate() {
        let cue = &cues[*idx];
        let prev = pos
            .checked_sub(1)
            .and_then(|p| speech_indices.get(p))
            .map(|&i| cues[i].text.clone());
        let prev2 = pos
            .checked_sub(2)
            .and_then(|p| speech_indices.get(p))
            .map(|&i| cues[i].text.clone());
        let next = speech_indices.get(pos + 1).map(|&i| cues[i].text.clone());
        let previous_text = match (prev2, prev) {
            (Some(a), Some(b)) => Some(format!("{a}\n{b}")),
            (None, Some(b)) => Some(b),
            _ => None,
        };
        translation_cues.push(TranslationCue {
            id: idx.to_string(),
            start: cue.start,
            end: cue.end,
            text: cue.text.clone(),
            speaker: cue.speaker.clone(),
            previous_text,
            next_text: next,
        });
    }
    TranslationBatchRequest {
        source_language: source_language.to_string(),
        target_language: target_language.to_string(),
        cues: translation_cues,
        glossary,
        context,
    }
}

pub fn apply_translation_results(
    cues: &mut [GeneratedSubtitleCue],
    response: &TranslationBatchResponse,
    glossary: Option<&crate::services::subtitle_franchise::FranchiseGlossary>,
    name_style: NameStyle,
    target_language: &str,
) {
    let map: HashMap<&str, &str> = response
        .entries()
        .iter()
        .map(|r| (r.id.as_str(), r.text.as_str()))
        .collect();
    let localized_lang = target_name_style(name_style, target_language);
    for (idx, cue) in cues.iter_mut().enumerate() {
        if is_non_speech_cue(cue.text.as_str()) {
            continue;
        }
        let key = idx.to_string();
        if let Some(translated) = map.get(key.as_str()) {
            cue.text = translated.to_string();
            cue.is_translated = true;
            if let Some(g) = glossary {
                cue.text = g.apply_post_translation(&cue.text, localized_lang);
            }
        }
    }
}

fn target_name_style(name_style: NameStyle, target_language: &str) -> &str {
    match name_style {
        NameStyle::RussianLocalized if target_language == "ru" => "ru",
        _ => target_language,
    }
}

pub fn validate_translation_output(
    cues: &[GeneratedSubtitleCue],
    source_speech_cue_count: Option<usize>,
) -> Result<(), String> {
    let speech: Vec<_> = cues
        .iter()
        .filter(|c| !is_non_speech_cue(&c.text))
        .collect();
    if speech.is_empty() {
        return Err("No speech cues after translation.".to_string());
    }
    if let Some(expected) = source_speech_cue_count {
        let translated = speech.iter().filter(|c| c.is_translated).count();
        if translated == 0 {
            return Err("No translated speech cues were produced.".to_string());
        }
        let min_expected = expected.saturating_sub((expected / 5).max(1));
        if translated < min_expected {
            return Err(format!(
                "Translated cue count too low: {translated} of {expected} expected."
            ));
        }
    }
    let empty = speech.iter().filter(|c| c.text.trim().is_empty()).count();
    if empty > speech.len() / 2 {
        return Err("Too many empty translated cues.".to_string());
    }
    let mut seen: HashMap<String, usize> = HashMap::new();
    for cue in &speech {
        let normalized = cue.text.trim().to_lowercase();
        if normalized.len() >= 12 {
            *seen.entry(normalized).or_insert(0) += 1;
        }
    }
    if speech.len() >= 5 {
        let max_repeat = seen.values().copied().max().unwrap_or(0);
        let repeat_ratio = max_repeat as f64 / speech.len() as f64;
        // LibreTranslate can collapse distinct lines into the same phrase; only fail on heavy collapse.
        if max_repeat >= 8 || (max_repeat >= 5 && repeat_ratio > 0.45) {
            return Err("repeated_hallucinated_text".to_string());
        }
    }
    for cue in cues {
        let t = cue.text.to_lowercase();
        if t.contains("-->") || t.contains("webvtt") || t.contains("[events]") {
            return Err("Translated cue contains raw subtitle format.".to_string());
        }
        if t.matches("00:00:").count() >= 2 {
            return Err("Translated cue contains timestamps.".to_string());
        }
    }
    Ok(())
}

/// Ensure translated speech cues actually use the target script (e.g. Cyrillic for ru).
pub fn validate_target_language_output(
    cues: &[GeneratedSubtitleCue],
    target_language: &str,
) -> Result<(), String> {
    if target_language != "ru" {
        return Ok(());
    }
    let speech: Vec<_> = cues
        .iter()
        .filter(|c| !is_non_speech_cue(&c.text))
        .collect();
    if speech.is_empty() {
        return Ok(());
    }
    let mut cyrillic = 0u32;
    for cue in &speech {
        cyrillic += count_script_chars(&cue.text).0;
    }
    if cyrillic < 8 {
        return Err("wrong_target_language".to_string());
    }
    Ok(())
}

const TRANSLATION_BATCH_SIZE: usize = 25;

fn repair_collapsed_translations(
    cues: &mut [GeneratedSubtitleCue],
    source_language: &str,
    target_language: &str,
    backend: &dyn TranslationBackend,
    franchise: Option<&crate::services::subtitle_franchise::FranchiseGlossary>,
    name_style: NameStyle,
) -> Result<(), String> {
    use std::collections::HashMap;

    let mut by_text: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, cue) in cues.iter().enumerate() {
        if !cue.is_translated || is_non_speech_cue(&cue.text) {
            continue;
        }
        let key = cue.text.trim().to_lowercase();
        if key.len() < 12 {
            continue;
        }
        by_text.entry(key).or_default().push(idx);
    }

    let glossary_payload = franchise.map(|g| g.to_translation_glossary(target_language));
    for indices in by_text.values() {
        if indices.len() < 4 {
            continue;
        }
        let mut distinct_sources = std::collections::HashSet::new();
        for &idx in indices {
            let source = cues[idx]
                .source_text
                .as_deref()
                .unwrap_or(cues[idx].text.as_str())
                .trim()
                .to_lowercase();
            if !source.is_empty() {
                distinct_sources.insert(source);
            }
        }
        if distinct_sources.len() < 2 {
            continue;
        }

        let mut repairs: Vec<(usize, String)> = Vec::new();
        for &idx in indices {
            let source_line = cues[idx]
                .source_text
                .as_deref()
                .unwrap_or(cues[idx].text.as_str())
                .to_string();
            repairs.push((idx, source_line));
        }
        for (idx, source_line) in repairs {
            let cue = &cues[idx];
            let batch = TranslationBatchRequest {
                source_language: source_language.to_string(),
                target_language: target_language.to_string(),
                cues: vec![TranslationCue {
                    id: idx.to_string(),
                    start: cue.start,
                    end: cue.end,
                    text: source_line,
                    speaker: cue.speaker.clone(),
                    previous_text: None,
                    next_text: None,
                }],
                glossary: glossary_payload.clone(),
                context: Some(TranslationContext {
                    preserve_honorifics: true,
                    target_language: target_language.to_string(),
                    name_style: "localized".into(),
                }),
            };
            let response = backend.translate_batch(&batch)?;
            apply_translation_results(cues, &response, franchise, name_style, target_language);
        }
    }
    Ok(())
}

pub fn translate_cues_in_batches<F>(
    cues: &mut [GeneratedSubtitleCue],
    source_language: &str,
    target_language: &str,
    translation_config: &TranslationConfig,
    franchise: Option<&crate::services::subtitle_franchise::FranchiseGlossary>,
    name_style: NameStyle,
    mut on_progress: F,
    host: Option<&TranslationHostContext>,
) -> Result<(), String>
where
    F: FnMut(usize, usize),
{
    if !translation_backend_available_at(
        translation_config,
        host.and_then(|h| h.resource_dir.as_deref()),
        host.and_then(|h| h.app_data.as_deref()),
    ) {
        return Err("unavailable_no_translation".to_string());
    }
    let backend = create_backend(translation_config, host)?;
    let glossary_payload = franchise.map(|g| g.to_translation_glossary(target_language));
    let speech_indices: Vec<usize> = cues
        .iter()
        .enumerate()
        .filter(|(_, c)| !is_non_speech_cue(&c.text))
        .map(|(i, _)| i)
        .collect();
    let total = speech_indices.len();
    if total == 0 {
        return Err("Source subtitles contain no speech cues.".to_string());
    }
    for cue in cues.iter_mut() {
        if !cue.is_translated && cue.source_text.is_none() && !is_non_speech_cue(&cue.text) {
            cue.source_text = Some(cue.text.clone());
        }
    }
    on_progress(0, total);
    for (batch_start, chunk) in speech_indices.chunks(TRANSLATION_BATCH_SIZE).enumerate() {
        let mut translation_cues = Vec::with_capacity(chunk.len());
        for (pos, &idx) in chunk.iter().enumerate() {
            let cue = &cues[idx];
            let prev = pos
                .checked_sub(1)
                .and_then(|p| chunk.get(p))
                .map(|&i| cues[i].text.clone());
            let next = chunk.get(pos + 1).map(|&i| cues[i].text.clone());
            translation_cues.push(TranslationCue {
                id: idx.to_string(),
                start: cue.start,
                end: cue.end,
                text: cue.text.clone(),
                speaker: cue.speaker.clone(),
                previous_text: prev,
                next_text: next,
            });
        }
        let batch = TranslationBatchRequest {
            source_language: source_language.to_string(),
            target_language: target_language.to_string(),
            cues: translation_cues,
            glossary: glossary_payload.clone(),
            context: Some(TranslationContext {
                preserve_honorifics: true,
                target_language: target_language.to_string(),
                name_style: "localized".into(),
            }),
        };
        let response = backend.translate_batch(&batch)?;
        apply_translation_results(cues, &response, franchise, name_style, target_language);
        let done = ((batch_start + 1) * TRANSLATION_BATCH_SIZE).min(total);
        on_progress(done, total);
    }

    repair_collapsed_translations(
        cues,
        source_language,
        target_language,
        backend.as_ref(),
        franchise,
        name_style,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_backend_translates_batch() {
        let backend = MockTranslationBackend;
        let request = TranslationBatchRequest {
            source_language: "ja".into(),
            target_language: "en".into(),
            cues: vec![TranslationCue {
                id: "0".into(),
                start: 0.0,
                end: 1.0,
                text: "Hello".into(),
                speaker: None,
                previous_text: None,
                next_text: None,
            }],
            glossary: None,
            context: None,
        };
        let response = backend.translate_batch(&request).unwrap();
        assert_eq!(response.entries()[0].text, "[en] Hello");
    }

    #[test]
    fn disabled_backend_not_available() {
        let config = TranslationConfig::default();
        assert!(!translation_backend_available(&config));
    }

    #[test]
    fn mock_backend_available() {
        let config = TranslationConfig {
            backend: TranslationBackendKind::Mock,
            ..Default::default()
        };
        assert!(translation_backend_available(&config));
    }

    #[test]
    fn detects_libretranslate_endpoint() {
        assert!(is_libretranslate_endpoint("http://127.0.0.1:5000"));
        assert!(is_libretranslate_endpoint("https://libretranslate.com"));
        assert!(!is_libretranslate_endpoint("https://api.example.com/v1/batch"));
    }

    #[test]
    fn normalizes_libretranslate_endpoint() {
        assert_eq!(
            libretranslate_endpoint("http://127.0.0.1:5000"),
            "http://127.0.0.1:5000/translate"
        );
        assert_eq!(
            libretranslate_endpoint("http://127.0.0.1:5000/translate"),
            "http://127.0.0.1:5000/translate"
        );
    }
}
