use crate::models::{
    FirstRunSetupBenchmarkResult, SetupBenchmark, SetupDownloadProgress, SetupDownloadResult,
    SetupModelCandidate, SetupRecommendation, SetupResourceStatus,
};
use crate::services::ffmpeg_util::quick_ffmpeg_available;
use crate::services::subtitle_generation::quick_whisper_cli_available;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

const MODEL_BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const DOWNLOAD_PROGRESS_EVENT: &str = "prism-setup-download-progress";

#[derive(Debug, Clone, Copy)]
struct ModelMeta {
    id: &'static str,
    friendly_label: &'static str,
    short_label: &'static str,
    description: &'static str,
    detail: &'static str,
    size_mb: u32,
}

const SETUP_MODELS: &[ModelMeta] = &[
    ModelMeta {
        id: "base",
        friendly_label: "Лёгкая",
        short_label: "Light",
        description: "Быстро запускается и подходит слабым компьютерам.",
        detail: "ggml-base.bin, около 150 MB. Быстрее всего, но иногда ошибается в сложной речи.",
        size_mb: 150,
    },
    ModelMeta {
        id: "small",
        friendly_label: "Сбалансированная",
        short_label: "Balanced",
        description: "Лучший баланс скорости и точности для большинства ПК.",
        detail: "ggml-small.bin, около 466 MB. Заметно точнее лёгкой модели и всё ещё достаточно быстрая.",
        size_mb: 466,
    },
    ModelMeta {
        id: "medium",
        friendly_label: "Точная",
        short_label: "Accurate",
        description: "Лучше распознаёт японскую речь, имена и быстрые диалоги.",
        detail: "ggml-medium.bin, около 1.5 GB. Медленнее, но заметно качественнее для аниме.",
        size_mb: 1530,
    },
    ModelMeta {
        id: "large-v3",
        friendly_label: "Максимальная",
        short_label: "Maximum",
        description: "Максимальная точность, если компьютер готов подождать.",
        detail: "ggml-large-v3.bin, около 3 GB. Самая точная, но самая тяжёлая.",
        size_mb: 3090,
    },
];

pub fn setup_models_dir(app_data: &Path) -> PathBuf {
    app_data.join("models")
}

fn model_file_name(model_id: &str) -> Result<String, String> {
    if SETUP_MODELS.iter().any(|model| model.id == model_id) {
        Ok(format!("ggml-{model_id}.bin"))
    } else {
        Err(format!("unsupported speech model: {model_id}"))
    }
}

pub fn setup_model_path(app_data: &Path, model_id: &str) -> Result<PathBuf, String> {
    Ok(setup_models_dir(app_data).join(model_file_name(model_id)?))
}

fn model_download_url(model_id: &str) -> Result<String, String> {
    Ok(format!("{MODEL_BASE_URL}/{}", model_file_name(model_id)?))
}

fn cpu_probe_score() -> SetupBenchmark {
    let thread_count = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let start = Instant::now();
    let iterations = 350_000_u64;
    let mut acc: u64 = 0x9e37_79b9;
    for i in 0..iterations {
        acc = acc.wrapping_mul(1_664_525).wrapping_add(i ^ (acc >> 13));
    }
    std::hint::black_box(acc);
    let elapsed = start.elapsed();
    let elapsed_ms = elapsed.as_millis().max(1);
    let score = iterations as f64 / elapsed_ms as f64;
    let tier = recommend_tier(thread_count, score).to_string();
    let confidence = if elapsed_ms < 120 { 0.58 } else { 0.72 };
    SetupBenchmark {
        elapsed_ms,
        thread_count,
        score,
        tier,
        confidence,
        source: "cpu-probe".to_string(),
    }
}

fn list_setup_installed_models(
    resource_dir: Option<&Path>,
    app_data_dir: Option<&Path>,
) -> Vec<String> {
    let mut installed: Vec<String> = Vec::new();
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(app_data) = app_data_dir {
        dirs.push(setup_models_dir(app_data));
    }
    if let Some(res) = resource_dir {
        dirs.push(res.join("models"));
        dirs.push(res.join("whisper/models"));
        dirs.push(res.join("bin/windows/models"));
    }
    for dir in dirs {
        let Ok(read) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with("ggml-") || !name.ends_with(".bin") {
                continue;
            }
            if let Some(model_id) = setup_model_id_from_filename(&name) {
                if !installed.iter().any(|existing| existing == &model_id) {
                    installed.push(model_id);
                }
            }
        }
    }
    installed.sort();
    installed
}

fn setup_model_id_from_filename(filename: &str) -> Option<String> {
    let stem = filename.strip_suffix(".bin")?;
    let rest = stem.strip_prefix("ggml-")?;
    let rest = rest.strip_suffix(".en").unwrap_or(rest);
    for model_id in ["large-v3", "large-v3-turbo", "large-v2", "large-v1", "medium", "small", "base", "tiny"] {
        if rest == model_id
            || rest.starts_with(&format!("{model_id}-"))
            || rest.starts_with(&format!("{model_id}_"))
        {
            return Some(model_id.to_string());
        }
    }
    None
}

pub fn recommend_tier(thread_count: usize, score: f64) -> &'static str {
    if thread_count >= 12 && score >= 220_000.0 {
        "high"
    } else if thread_count >= 6 && score >= 95_000.0 {
        "balanced"
    } else {
        "low"
    }
}

pub fn recommended_model_for_tier(tier: &str) -> &'static str {
    match tier {
        "high" => "medium",
        "balanced" => "small",
        _ => "base",
    }
}

fn recommendation_reason(tier: &str) -> &'static str {
    match tier {
        "high" => "high",
        "balanced" => "balanced",
        _ => "low",
    }
}

fn build_candidates(installed_models: &[String], recommended_id: &str) -> Vec<SetupModelCandidate> {
    SETUP_MODELS
        .iter()
        .map(|model| SetupModelCandidate {
            id: model.id.to_string(),
            friendly_label: model.friendly_label.to_string(),
            short_label: model.short_label.to_string(),
            description: model.description.to_string(),
            technical_detail: model.detail.to_string(),
            expected_file_name: model_file_name(model.id).unwrap_or_default(),
            download_url: model_download_url(model.id).unwrap_or_default(),
            estimated_size_mb: model.size_mb,
            installed: installed_models
                .iter()
                .any(|installed| installed == model.id),
            recommended: model.id == recommended_id,
        })
        .collect()
}

pub fn run_first_run_setup_benchmark(
    app: &AppHandle,
) -> Result<FirstRunSetupBenchmarkResult, String> {
    let resource_dir = app.path().resource_dir().ok();
    let resource_ref = resource_dir.as_deref();
    let app_data = app.path().app_data_dir().ok();
    let app_data_ref = app_data.as_deref();

    let benchmark = cpu_probe_score();
    let recommended_id = recommended_model_for_tier(&benchmark.tier);

    let ffmpeg_available = quick_ffmpeg_available(resource_ref);
    let whisper_cli_available = quick_whisper_cli_available(resource_ref);
    let installed_models = list_setup_installed_models(resource_ref, app_data_ref);
    let models = build_candidates(&installed_models, recommended_id);
    let recommended_candidate = models
        .iter()
        .find(|model| model.id == recommended_id)
        .ok_or_else(|| "recommended model is not available".to_string())?;

    Ok(FirstRunSetupBenchmarkResult {
        resources: SetupResourceStatus {
            ffmpeg_available,
            whisper_cli_available,
            installed_models,
            ffmpeg_path: None,
            whisper_cli_path: None,
        },
        recommendation: SetupRecommendation {
            model_id: recommended_candidate.id.clone(),
            friendly_label: recommended_candidate.friendly_label.clone(),
            reason: recommendation_reason(&benchmark.tier).to_string(),
            confidence: benchmark.confidence,
            installed: recommended_candidate.installed,
        },
        benchmark,
        models,
    })
}

fn emit_download_progress(app: &AppHandle, payload: SetupDownloadProgress) {
    let _ = app.emit(DOWNLOAD_PROGRESS_EVENT, payload);
}

pub fn download_whisper_model(
    app: &AppHandle,
    model_id: &str,
    cancel_flag: Arc<AtomicBool>,
) -> Result<SetupDownloadResult, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = setup_models_dir(&app_data);
    fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    let target = setup_model_path(&app_data, model_id)?;
    if target.exists() {
        let bytes = target.metadata().map(|m| m.len()).unwrap_or(0);
        return Ok(SetupDownloadResult {
            model_id: model_id.to_string(),
            file_path: target.to_string_lossy().to_string(),
            bytes,
            already_installed: true,
        });
    }

    let url = model_download_url(model_id)?;
    emit_download_progress(
        app,
        SetupDownloadProgress {
            model_id: model_id.to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            progress: 0.0,
            status: "starting".to_string(),
        },
    );

    let response = ureq::get(&url)
        .call()
        .map_err(|e| format!("failed to download speech model: {e}"))?;
    let total_bytes = response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok());
    let temp_path = target.with_extension("bin.download");
    let mut reader = response.into_reader();
    let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut buffer = [0_u8; 64 * 1024];
    let mut downloaded = 0_u64;

    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = fs::remove_file(&temp_path);
            emit_download_progress(
                app,
                SetupDownloadProgress {
                    model_id: model_id.to_string(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    progress: total_bytes
                        .filter(|total| *total > 0)
                        .map(|total| (downloaded as f64 / total as f64).clamp(0.0, 1.0))
                        .unwrap_or(0.0),
                    status: "cancelled".to_string(),
                },
            );
            return Err("download_cancelled".to_string());
        }
        let read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        downloaded += read as u64;
        let progress = total_bytes
            .filter(|total| *total > 0)
            .map(|total| (downloaded as f64 / total as f64).clamp(0.0, 1.0))
            .unwrap_or(0.0);
        emit_download_progress(
            app,
            SetupDownloadProgress {
                model_id: model_id.to_string(),
                downloaded_bytes: downloaded,
                total_bytes,
                progress,
                status: "downloading".to_string(),
            },
        );
    }
    file.flush().map_err(|e| e.to_string())?;
    fs::rename(&temp_path, &target).map_err(|e| e.to_string())?;
    emit_download_progress(
        app,
        SetupDownloadProgress {
            model_id: model_id.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: Some(downloaded),
            progress: 1.0,
            status: "complete".to_string(),
        },
    );

    Ok(SetupDownloadResult {
        model_id: model_id.to_string(),
        file_path: target.to_string_lossy().to_string(),
        bytes: downloaded,
        already_installed: false,
    })
}

pub fn delete_whisper_model(app: &AppHandle, model_id: &str) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target = setup_model_path(&app_data, model_id)?;
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let resource_dir = app.path().resource_dir().ok();
    if let Some(res) = resource_dir.as_ref() {
        let bundled = res.join("models").join(model_file_name(model_id)?);
        if bundled.exists() {
            return Err("bundled_model_cannot_delete".to_string());
        }
    }

    Err(format!("speech model not found: {model_id}"))
}

#[cfg(test)]
mod tests {
    use super::{model_download_url, model_file_name, recommend_tier, recommended_model_for_tier};

    #[test]
    fn recommends_model_from_tier() {
        assert_eq!(recommended_model_for_tier("low"), "base");
        assert_eq!(recommended_model_for_tier("balanced"), "small");
        assert_eq!(recommended_model_for_tier("high"), "medium");
    }

    #[test]
    fn ranks_hardware_tiers() {
        assert_eq!(recommend_tier(4, 80_000.0), "low");
        assert_eq!(recommend_tier(8, 120_000.0), "balanced");
        assert_eq!(recommend_tier(16, 250_000.0), "high");
    }

    #[test]
    fn resolves_model_url_and_file_name() {
        assert_eq!(model_file_name("small").unwrap(), "ggml-small.bin");
        assert!(model_download_url("large-v3")
            .unwrap()
            .ends_with("/ggml-large-v3.bin"));
        assert!(model_file_name("unknown").is_err());
    }
}
