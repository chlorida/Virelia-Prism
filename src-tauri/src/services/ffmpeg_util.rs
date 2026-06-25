use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use super::process_util::hidden_command;

static FFMPEG_CACHE: Mutex<Option<FfmpegPaths>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegPaths {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub available: bool,
    pub bundled: bool,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub searched: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct FfmpegError {
    pub searched: Vec<String>,
}

impl std::fmt::Display for FfmpegError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "FFmpeg binaries were not found")
    }
}

fn probe_binary(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    let path = path.to_path_buf();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let ok = hidden_command(&path)
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        let _ = tx.send(ok);
    });
    rx.recv_timeout(Duration::from_millis(1_500)).unwrap_or(false)
}

fn sibling_ffprobe(ffmpeg: &Path) -> PathBuf {
    let name = ffmpeg
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("ffmpeg.exe");
    let probe_name = name.replace("ffmpeg", "ffprobe");
    ffmpeg.with_file_name(probe_name)
}

fn locate_on_path(binary: &str) -> Option<PathBuf> {
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
    if path.exists() && probe_binary(&path) {
        Some(path)
    } else {
        None
    }
}

/// Fast existence check for first-run setup — avoids probing every PATH candidate.
pub fn quick_ffmpeg_available(resource_dir: Option<&Path>) -> bool {
    if let Ok(guard) = FFMPEG_CACHE.lock() {
        if guard.is_some() {
            return true;
        }
    }
    if let Some(res) = resource_dir {
        for candidate in bundled_candidates(res) {
            if candidate.exists() && sibling_ffprobe(&candidate).exists() {
                return true;
            }
        }
    }
    false
}

fn bundled_candidates(resource_dir: &Path) -> Vec<PathBuf> {
    let names = if cfg!(windows) {
        ("ffmpeg.exe", "ffprobe.exe")
    } else {
        ("ffmpeg", "ffprobe")
    };
    vec![
        resource_dir.join("bin/windows").join(names.0),
        resource_dir.join("bin").join(names.0),
        resource_dir.join(names.0),
        resource_dir.join("ffmpeg").join("bin").join(names.0),
    ]
}

fn dev_tool_candidates() -> Vec<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest.parent().unwrap_or(&manifest);
    vec![
        project_root.join("tools/ffmpeg/ffmpeg.exe"),
        project_root.join("tools/ffmpeg/ffprobe.exe"),
        project_root.join("vendor/ffmpeg/ffmpeg.exe"),
        project_root.join("vendor/ffmpeg/ffprobe.exe"),
        manifest.join("resources/bin/windows/ffmpeg.exe"),
        manifest.join("resources/bin/windows/ffprobe.exe"),
    ]
}

fn portable_candidates(exe_dir: &Path) -> Vec<PathBuf> {
    let name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    vec![
        exe_dir.join(name),
        exe_dir.join("bin").join(name),
        exe_dir.join("resources").join(name),
        exe_dir.join("resources/bin").join(name),
        exe_dir.join("resources/bin/windows").join(name),
        exe_dir.join("ffmpeg/bin").join(name),
    ]
}

fn windows_standard_candidates() -> Vec<PathBuf> {
    vec![
        PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"),
        PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
        PathBuf::from(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
    ]
}

fn try_pair(
    ffmpeg: PathBuf,
    searched: &mut Vec<String>,
    bundled: bool,
) -> Option<(FfmpegPaths, bool)> {
    searched.push(ffmpeg.display().to_string());
    if !probe_binary(&ffmpeg) {
        return None;
    }
    let ffprobe = sibling_ffprobe(&ffmpeg);
    searched.push(ffprobe.display().to_string());
    if !probe_binary(&ffprobe) {
        return None;
    }
    Some((FfmpegPaths { ffmpeg, ffprobe }, bundled))
}

pub fn locate_ffmpeg(resource_dir: Option<&Path>) -> Result<FfmpegPaths, FfmpegError> {
    if let Ok(guard) = FFMPEG_CACHE.lock() {
        if let Some(ref cached) = *guard {
            return Ok(cached.clone());
        }
    }

    let mut searched = Vec::new();

    if let Some(res) = resource_dir {
        for candidate in bundled_candidates(res) {
            if let Some((pair, _)) = try_pair(candidate, &mut searched, true) {
                cache_ffmpeg(pair.clone());
                return Ok(pair);
            }
        }
    }

    for candidate in dev_tool_candidates() {
        if candidate.to_string_lossy().contains("ffprobe") {
            continue;
        }
        if let Some((pair, _)) = try_pair(candidate, &mut searched, false) {
            cache_ffmpeg(pair.clone());
            return Ok(pair);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in portable_candidates(dir) {
                if let Some((pair, _)) = try_pair(candidate, &mut searched, false) {
                    cache_ffmpeg(pair.clone());
                    return Ok(pair);
                }
            }
        }
    }

    searched.push("PATH".to_string());
    if let Some(path) = locate_on_path("ffmpeg") {
        if let Some((pair, _)) = try_pair(path, &mut searched, false) {
            cache_ffmpeg(pair.clone());
            return Ok(pair);
        }
    }

    for candidate in windows_standard_candidates() {
        if let Some((pair, _)) = try_pair(candidate, &mut searched, false) {
            cache_ffmpeg(pair.clone());
            return Ok(pair);
        }
    }

    eprintln!(
        "[Virelia subtitles] FFmpeg not found. Searched: {}",
        searched.join(", ")
    );

    Err(FfmpegError { searched })
}

pub fn ffmpeg_status(resource_dir: Option<&Path>) -> FfmpegStatus {
    match locate_ffmpeg(resource_dir) {
        Ok(paths) => {
            let bundled = resource_dir
                .is_some_and(|res| bundled_candidates(res).iter().any(|c| c == &paths.ffmpeg));
            FfmpegStatus {
                available: true,
                bundled,
                ffmpeg_path: Some(paths.ffmpeg.to_string_lossy().to_string()),
                ffprobe_path: Some(paths.ffprobe.to_string_lossy().to_string()),
                searched: vec![],
            }
        }
        Err(err) => FfmpegStatus {
            available: false,
            bundled: false,
            ffmpeg_path: None,
            ffprobe_path: None,
            searched: err.searched,
        },
    }
}

fn cache_ffmpeg(paths: FfmpegPaths) {
    if let Ok(mut guard) = FFMPEG_CACHE.lock() {
        *guard = Some(paths);
    }
}
