use crate::services::process_util::hidden_command;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WhisperGpuMode {
    Auto,
    On,
    Off,
}

impl WhisperGpuMode {
    pub fn from_settings_value(raw: &str) -> Self {
        match raw.to_lowercase().as_str() {
            "on" | "enabled" | "true" | "gpu" => Self::On,
            "off" | "disabled" | "false" | "cpu" => Self::Off,
            _ => Self::Auto,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::On => "on",
            Self::Off => "off",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperGpuConfig {
    pub mode: WhisperGpuMode,
    pub layers: u32,
}

impl Default for WhisperGpuConfig {
    fn default() -> Self {
        Self {
            mode: WhisperGpuMode::Auto,
            layers: 99,
        }
    }
}

pub fn load_whisper_gpu_config(settings: &Value) -> WhisperGpuConfig {
    if let Ok(mode) = std::env::var("VIRELIA_WHISPER_GPU") {
        let normalized = mode.to_lowercase();
        if matches!(normalized.as_str(), "0" | "false" | "off" | "no") {
            return WhisperGpuConfig {
                mode: WhisperGpuMode::Off,
                ..Default::default()
            };
        }
        if matches!(normalized.as_str(), "1" | "true" | "on" | "yes") {
            return WhisperGpuConfig {
                mode: WhisperGpuMode::On,
                ..Default::default()
            };
        }
    }

    let subtitles = settings.get("subtitles").cloned().unwrap_or(Value::Null);
    let mode = subtitles
        .get("whisperGpu")
        .and_then(|v| v.as_str())
        .map(WhisperGpuMode::from_settings_value)
        .unwrap_or(WhisperGpuMode::Auto);
    let layers = subtitles
        .get("whisperGpuLayers")
        .and_then(|v| v.as_u64())
        .map(|v| v.clamp(1, 99) as u32)
        .unwrap_or(99);
    WhisperGpuConfig { mode, layers }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperGpuCapabilities {
    pub supports_gpu_layers: bool,
    pub inferred_backend: Option<String>,
    pub binary_name: String,
    pub uses_ngl_flag: bool,
}

#[derive(Debug, Clone)]
pub struct WhisperRuntimePlan {
    pub use_gpu: bool,
    pub gpu_layers: u32,
}

#[derive(Debug, Clone)]
pub struct WhisperSessionRuntime {
    pub config: WhisperGpuConfig,
    pub capabilities: WhisperGpuCapabilities,
    pub plan: WhisperRuntimePlan,
    pub gpu_fallback_applied: bool,
}

impl WhisperSessionRuntime {
    pub fn new(config: WhisperGpuConfig, capabilities: WhisperGpuCapabilities) -> Self {
        let use_gpu = match config.mode {
            WhisperGpuMode::On => true,
            WhisperGpuMode::Off => false,
            WhisperGpuMode::Auto => capabilities.supports_gpu_layers,
        };
        let plan = WhisperRuntimePlan {
            use_gpu,
            gpu_layers: config.layers.max(1),
        };
        Self {
            config,
            capabilities,
            plan,
            gpu_fallback_applied: false,
        }
    }

    pub fn active_backend_label(&self) -> String {
        if self.plan.use_gpu {
            self.capabilities
                .inferred_backend
                .clone()
                .unwrap_or_else(|| "gpu".to_string())
        } else if self.gpu_fallback_applied {
            "cpu-fallback".to_string()
        } else {
            "cpu".to_string()
        }
    }
}

pub fn infer_backend_from_binary(path: &Path) -> Option<String> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();
    if name.contains("cuda") {
        Some("cuda".to_string())
    } else if name.contains("vulkan") {
        Some("vulkan".to_string())
    } else if name.contains("metal") {
        Some("metal".to_string())
    } else if name.contains("rocm") || name.contains("hip") {
        Some("rocm".to_string())
    } else {
        None
    }
}

pub fn probe_whisper_gpu_capabilities(whisper: &Path) -> WhisperGpuCapabilities {
    let binary_name = whisper
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("whisper-cli")
        .to_string();
    let inferred_backend = infer_backend_from_binary(whisper);

    let output = hidden_command(whisper)
        .arg("-h")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    let help = output
        .map(|out| {
            format!(
                "{}{}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            )
        })
        .unwrap_or_default();
    let help_lower = help.to_lowercase();

    let uses_ngl_flag = help_lower.contains("-ngl")
        || help_lower.contains("gpu-layers")
        || help_lower.contains("--gpu-layers");
    let supports_gpu_layers = uses_ngl_flag
        || help_lower.contains("--no-gpu")
        || help_lower.contains(" -ng,")
        || inferred_backend.is_some();

    WhisperGpuCapabilities {
        supports_gpu_layers,
        inferred_backend,
        binary_name,
        uses_ngl_flag,
    }
}

pub fn whisper_binary_search_dirs(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(res) = resource_dir {
        dirs.push(res.join("bin/windows"));
        dirs.push(res.join("bin"));
        dirs.push(res.to_path_buf());
        dirs.push(res.join("whisper"));
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    dirs.push(manifest.join("resources/bin/windows"));
    let project_root = manifest.parent().unwrap_or(&manifest);
    dirs.push(project_root.join("tools/whisper"));
    dirs.push(project_root.join("vendor/whisper"));
    if let Ok(ffmpeg) = crate::services::ffmpeg_util::locate_ffmpeg(resource_dir) {
        if let Some(parent) = ffmpeg.ffmpeg.parent() {
            dirs.push(parent.to_path_buf());
        }
    }
    dirs
}

pub fn locate_whisper_binary(
    resource_dir: Option<&Path>,
    gpu_config: &WhisperGpuConfig,
) -> Option<PathBuf> {
    let prefer_gpu = gpu_config.mode != WhisperGpuMode::Off;
    let names: Vec<&str> = if prefer_gpu {
        whisper_cli_names_gpu_first()
    } else {
        whisper_cli_names_cpu_only().to_vec()
    };
    for dir in whisper_binary_search_dirs(resource_dir) {
        if !dir.is_dir() {
            continue;
        }
        for name in &names {
            let path = dir.join(name);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

pub fn apply_whisper_runtime_args(cmd: &mut Command, runtime: &WhisperSessionRuntime) {
    if runtime.plan.use_gpu {
        if runtime.capabilities.uses_ngl_flag {
            cmd.arg("-ngl").arg(runtime.plan.gpu_layers.to_string());
        }
        // Modern whisper.cpp: GPU is enabled unless -ng is passed.
    } else {
        cmd.arg("-ng");
    }
}

pub fn is_gpu_transcription_failure(stderr: &[u8]) -> bool {
    let text = String::from_utf8_lossy(stderr).to_lowercase();
    [
        "cuda",
        "vulkan",
        "metal",
        "rocm",
        "gpu",
        "cublas",
        "out of memory",
        "oom",
        "failed to initialize",
        "no device",
        "not compiled with",
        "ggml_vulkan",
        "ggml_cuda",
    ]
    .iter()
    .any(|needle| text.contains(needle))
}

pub fn whisper_cli_names_gpu_first() -> Vec<&'static str> {
    if cfg!(windows) {
        vec![
            "whisper-cli-cuda.exe",
            "whisper-cli-vulkan.exe",
            "whisper-cli.exe",
            "whisper.exe",
            "main.exe",
            "whisper-cpp.exe",
        ]
    } else if cfg!(target_os = "macos") {
        vec!["whisper-cli", "whisper", "main"]
    } else {
        vec![
            "whisper-cli-cuda",
            "whisper-cli-vulkan",
            "whisper-cli",
            "whisper",
            "main",
        ]
    }
}

pub fn whisper_cli_names_cpu_only() -> &'static [&'static str] {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gpu_mode_from_settings() {
        assert_eq!(WhisperGpuMode::from_settings_value("auto"), WhisperGpuMode::Auto);
        assert_eq!(WhisperGpuMode::from_settings_value("on"), WhisperGpuMode::On);
        assert_eq!(WhisperGpuMode::from_settings_value("off"), WhisperGpuMode::Off);
    }

    #[test]
    fn infers_cuda_binary_name() {
        let path = PathBuf::from(r"C:\bin\whisper-cli-cuda.exe");
        assert_eq!(infer_backend_from_binary(&path).as_deref(), Some("cuda"));
    }

    #[test]
    fn auto_mode_enables_gpu_when_supported() {
        let caps = WhisperGpuCapabilities {
            supports_gpu_layers: true,
            inferred_backend: Some("cuda".to_string()),
            binary_name: "whisper-cli-cuda.exe".to_string(),
            uses_ngl_flag: false,
        };
        let session = WhisperSessionRuntime::new(WhisperGpuConfig::default(), caps);
        assert!(session.plan.use_gpu);
    }

    #[test]
    fn off_mode_disables_gpu_even_when_supported() {
        let caps = WhisperGpuCapabilities {
            supports_gpu_layers: true,
            inferred_backend: Some("cuda".to_string()),
            binary_name: "whisper-cli-cuda.exe".to_string(),
            uses_ngl_flag: false,
        };
        let session = WhisperSessionRuntime::new(
            WhisperGpuConfig {
                mode: WhisperGpuMode::Off,
                layers: 99,
            },
            caps,
        );
        assert!(!session.plan.use_gpu);
    }

    #[test]
    fn detects_gpu_failure_snippets() {
        assert!(is_gpu_transcription_failure(
            b"error: failed to initialize cuBLAS"
        ));
        assert!(!is_gpu_transcription_failure(b"segment too short"));
    }
}
