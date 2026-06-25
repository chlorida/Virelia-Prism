use crate::models::{FirstRunSetupBenchmarkResult, SetupDownloadResult};
use crate::services::setup_benchmark::{
    delete_whisper_model as delete_whisper_model_service,
    download_whisper_model as download_whisper_model_service,
    run_first_run_setup_benchmark as run_first_run_setup_benchmark_service,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

#[derive(Default)]
pub struct SetupDownloadRegistry {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl SetupDownloadRegistry {
    fn register(&self, model_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut active) = self.active.lock() {
            active.insert(model_id.to_string(), flag.clone());
        }
        flag
    }

    fn cancel(&self, model_id: &str) -> bool {
        let Ok(active) = self.active.lock() else {
            return false;
        };
        if let Some(flag) = active.get(model_id) {
            flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    fn remove(&self, model_id: &str) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(model_id);
        }
    }
}

#[tauri::command]
pub async fn run_first_run_setup_benchmark(
    app: AppHandle,
) -> Result<FirstRunSetupBenchmarkResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_first_run_setup_benchmark_service(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn download_whisper_model(
    app: AppHandle,
    registry: State<'_, SetupDownloadRegistry>,
    model_id: String,
) -> Result<SetupDownloadResult, String> {
    let cancel_flag = registry.register(&model_id);
    let model_id_for_cleanup = model_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        download_whisper_model_service(&app, &model_id, cancel_flag)
    })
    .await
    .map_err(|e| e.to_string())?;
    registry.remove(&model_id_for_cleanup);
    result
}

#[tauri::command]
pub fn cancel_whisper_model_download(
    registry: State<'_, SetupDownloadRegistry>,
    model_id: String,
) -> bool {
    registry.cancel(&model_id)
}

#[tauri::command]
pub fn delete_whisper_model(app: AppHandle, model_id: String) -> Result<bool, String> {
    delete_whisper_model_service(&app, &model_id)?;
    Ok(true)
}
