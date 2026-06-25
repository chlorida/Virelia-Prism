use crate::services::process_util::hidden_command;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const BUILTIN_TRANSLATION_PORT: u16 = 55123;

pub fn builtin_translate_url() -> String {
    format!("http://127.0.0.1:{BUILTIN_TRANSLATION_PORT}/translate")
}

pub fn builtin_languages_url() -> String {
    format!("http://127.0.0.1:{BUILTIN_TRANSLATION_PORT}/languages")
}

pub struct BuiltinTranslationRuntime {
    child: Mutex<Option<Child>>,
}

impl Default for BuiltinTranslationRuntime {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

impl Drop for BuiltinTranslationRuntime {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn venv_libretranslate_exe(venv_root: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let exe = venv_root.join("Scripts").join("libretranslate.exe");
        if exe.is_file() {
            return Some(exe);
        }
        let python = venv_root.join("Scripts").join("python.exe");
        if python.is_file() {
            return Some(python);
        }
    }
    #[cfg(not(windows))]
    {
        let exe = venv_root.join("bin").join("libretranslate");
        if exe.is_file() {
            return Some(exe);
        }
        let python = venv_root.join("bin").join("python3");
        if python.is_file() {
            return Some(python);
        }
        let python = venv_root.join("bin").join("python");
        if python.is_file() {
            return Some(python);
        }
    }
    None
}

pub fn locate_builtin_translation_venv(
    resource_dir: Option<&Path>,
    app_data: Option<&Path>,
) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(res) = resource_dir {
        candidates.push(res.join("translation").join("venv"));
    }
    if let Some(data) = app_data {
        candidates.push(data.join("translation").join("venv"));
    }
    for venv in candidates {
        if venv_libretranslate_exe(&venv).is_some() {
            return Some(venv);
        }
    }
    None
}

pub fn is_builtin_translation_installed(
    resource_dir: Option<&Path>,
    app_data: Option<&Path>,
) -> bool {
    locate_builtin_translation_venv(resource_dir, app_data).is_some()
}

pub fn is_builtin_translation_healthy() -> bool {
    ureq::get(&builtin_languages_url())
        .timeout(Duration::from_secs(2))
        .call()
        .map(|r| r.status() >= 200 && r.status() < 300)
        .unwrap_or(false)
}

fn spawn_builtin_server(venv_root: &Path) -> Result<Child, String> {
    let launcher = venv_libretranslate_exe(venv_root)
        .ok_or_else(|| "builtin_translation_not_installed".to_string())?;

    let mut cmd = hidden_command(&launcher);
    let file_name = launcher
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if file_name.contains("python") {
        cmd.args([
            "-m",
            "libretranslate",
            "--host",
            "127.0.0.1",
            "--port",
            &BUILTIN_TRANSLATION_PORT.to_string(),
        ]);
    } else {
        cmd.args([
            "--host",
            "127.0.0.1",
            "--port",
            &BUILTIN_TRANSLATION_PORT.to_string(),
        ]);
    }

    cmd.spawn()
        .map_err(|e| format!("builtin_translation_start_failed: {e}"))
}

pub fn ensure_builtin_translation_server(
    runtime: &BuiltinTranslationRuntime,
    resource_dir: Option<&Path>,
    app_data: Option<&Path>,
) -> Result<(), String> {
    if is_builtin_translation_healthy() {
        return Ok(());
    }

    let venv = locate_builtin_translation_venv(resource_dir, app_data)
        .ok_or_else(|| "builtin_translation_not_installed".to_string())?;

    let mut guard = runtime
        .child
        .lock()
        .map_err(|_| "builtin_translation_lock_failed".to_string())?;

    if let Some(child) = guard.as_mut() {
        if child.try_wait().ok().flatten().is_some() {
            *guard = None;
        }
    }

    if guard.is_none() {
        let child = spawn_builtin_server(&venv)?;
        *guard = Some(child);
        eprintln!(
            "[Virelia translation] Starting built-in LibreTranslate on port {BUILTIN_TRANSLATION_PORT}"
        );
    }

    let deadline = Instant::now() + Duration::from_secs(90);
    while Instant::now() < deadline {
        if is_builtin_translation_healthy() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    Err("builtin_translation_start_timeout".to_string())
}
