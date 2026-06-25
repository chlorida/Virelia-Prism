use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    SourceCodeFile,
    DevFolder,
    ShortSfx,
    TestFixture,
    UnsupportedExtension,
    AmbiguousExtension,
    #[allow(dead_code)]
    DurationTooShort,
    PersonalMedia,
}

impl SkipReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SourceCodeFile => "source-code-file",
            Self::DevFolder => "dev-folder",
            Self::ShortSfx => "short-sfx",
            Self::TestFixture => "test-fixture",
            Self::UnsupportedExtension => "unsupported-extension",
            Self::AmbiguousExtension => "ambiguous-extension",
            Self::DurationTooShort => "duration-too-short",
            Self::PersonalMedia => "personal-media",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtensionInfo {
    pub compound_extension: String,
    pub simple_extension: String,
}

const ALWAYS_IGNORED_EXTENSIONS: &[&str] = &[
    ".d.ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".map", ".css", ".scss", ".sass",
    ".less", ".html", ".xml", ".yml", ".yaml", ".toml", ".rs", ".cpp", ".c", ".h", ".hpp", ".cs",
    ".py", ".lua", ".java", ".kt", ".swift", ".go", ".php", ".rb", ".md", ".txt", ".log", ".ini",
    ".cfg",
];

const AUDIO_EXTENSIONS: &[&str] = &[
    ".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".opus", ".wma",
];

const VIDEO_EXTENSIONS: &[&str] = &[
    ".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".m2ts", ".flv", ".wmv",
];

const SUSPICIOUS_PATH_SEGMENTS: &[&str] = &[
    "audiofilters",
    "audiofilter",
    "dvaaudiofilters",
    "sfx",
    "sounds",
    "sound",
    "\\wav\\",
    "/wav/",
    "assets",
    "samples",
    "engine",
    "game",
    "types",
    "mzscripting",
    "mediacorebackend",
    "algebra",
    "graphics",
    "node_modules",
    "\\src\\",
    "/src/",
    "\\dist\\",
    "/dist/",
    "\\build\\",
    "/build/",
    "\\target\\",
    "/target/",
    "vendor",
    "third_party",
    "third-party",
    "\\tests\\",
    "/tests/",
    "\\testdata\\",
    "/testdata/",
    "\\test-data\\",
    "/test-data/",
    "\\fixtures\\",
    "/fixtures/",
    "\\__tests__\\",
    "/__tests__/",
];

const TEST_PATH_SEGMENTS: &[&str] = &[
    "tests",
    "testdata",
    "test-data",
    "fixtures",
    "__tests__",
    "spec",
    "specs",
    "mocks",
];

pub fn is_test_or_fixture_path(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            let seg = name.to_string_lossy().to_lowercase();
            if TEST_PATH_SEGMENTS.contains(&seg.as_str()) {
                return true;
            }
        }
    }
    false
}

/// Audio/video codec test vectors (e.g. Test-44100hz-2ch-32bit-Float-Be.wav).
pub fn is_likely_test_fixture_file(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    if !lower.starts_with("test-") {
        return false;
    }
    lower.contains("hz")
        || lower.contains("-ch-")
        || lower.contains("rf64")
        || lower.contains("eof")
        || lower.contains("chunk")
}

pub fn get_extension_info(file_name: &str) -> ExtensionInfo {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".d.ts") {
        return ExtensionInfo {
            compound_extension: ".d.ts".to_string(),
            simple_extension: "d.ts".to_string(),
        };
    }
    for ext in ALWAYS_IGNORED_EXTENSIONS {
        if lower.ends_with(ext) {
            return ExtensionInfo {
                compound_extension: ext.to_string(),
                simple_extension: ext.trim_start_matches('.').to_string(),
            };
        }
    }
    let simple = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_default();
    ExtensionInfo {
        compound_extension: simple.clone(),
        simple_extension: simple.trim_start_matches('.').to_string(),
    }
}

pub fn is_always_ignored_file(file_name: &str, extension_info: &ExtensionInfo) -> bool {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".d.ts") {
        return true;
    }
    if extension_info.compound_extension == ".ts" || extension_info.compound_extension == ".dts" {
        return false;
    }
    ALWAYS_IGNORED_EXTENSIONS
        .iter()
        .any(|ext| extension_info.compound_extension == *ext)
}

pub fn is_suspicious_asset_path(path: &Path) -> bool {
    let lower = path.to_string_lossy().replace('/', "\\").to_lowercase();
    SUSPICIOUS_PATH_SEGMENTS
        .iter()
        .any(|seg| lower.contains(seg))
}

fn normalize_ext(ext: &str) -> String {
    let trimmed = ext.trim().to_lowercase();
    if trimmed.is_empty() {
        String::new()
    } else if trimmed.starts_with('.') {
        trimmed
    } else {
        format!(".{trimmed}")
    }
}

pub fn detect_media_kind_from_extension(
    extension_info: &ExtensionInfo,
) -> Option<crate::models::MediaKind> {
    if is_always_ignored_file("", extension_info) {
        return None;
    }
    let ext = normalize_ext(&extension_info.compound_extension);
    if ext == ".ts" || ext == ".dts" {
        return None;
    }
    if AUDIO_EXTENSIONS.contains(&ext.as_str()) {
        return Some(crate::models::MediaKind::Audio);
    }
    if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Some(crate::models::MediaKind::Video);
    }
    None
}

fn read_wav_duration_secs(path: &Path) -> Option<f64> {
    let data = std::fs::read(path).ok()?;
    if data.len() < 44 || &data[0..4] != b"RIFF" || &data[8..12] != b"WAVE" {
        return None;
    }
    let byte_rate = u32::from_le_bytes(data[28..32].try_into().ok()?);
    if byte_rate == 0 {
        return None;
    }
    let mut offset = 12usize;
    while offset + 8 <= data.len() {
        let chunk_id = &data[offset..offset + 4];
        let chunk_size = u32::from_le_bytes(data[offset + 4..offset + 8].try_into().ok()?) as usize;
        if chunk_id == b"data" {
            return Some(chunk_size as f64 / byte_rate as f64);
        }
        offset += 8 + chunk_size + (chunk_size % 2);
    }
    None
}

/// Screen recordings, OBS clips, YouTube counters, and other non-library personal media.
pub fn is_likely_personal_or_junk_media(file_name: &str, path: &Path) -> bool {
    let lower_name = file_name.to_lowercase();
    let lower_path = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();

    if lower_name.starts_with("__") {
        return true;
    }

    if lower_name.starts_with('(') && lower_name.chars().nth(1).is_some_and(|c| c.is_ascii_digit()) {
        return true;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);

    if stem.len() >= 10 {
        let bytes = stem.as_bytes();
        if bytes.len() >= 10
            && bytes[0].is_ascii_digit()
            && bytes[1].is_ascii_digit()
            && bytes[2].is_ascii_digit()
            && bytes[3].is_ascii_digit()
            && bytes[4] == b'-'
            && bytes[5].is_ascii_digit()
            && bytes[6].is_ascii_digit()
            && bytes[7] == b'-'
            && bytes[8].is_ascii_digit()
            && bytes[9].is_ascii_digit()
        {
            return true;
        }
    }

    const PERSONAL_PATH_MARKERS: &[&str] = &[
        "\\captures\\",
        "\\screen recordings\\",
        "\\screen record\\",
        "\\obs\\",
        "\\nvidia\\",
        "\\shadowplay\\",
        "\\sharex\\",
    ];

    if PERSONAL_PATH_MARKERS
        .iter()
        .any(|marker| lower_path.contains(marker))
    {
        return true;
    }

    const PERSONAL_NAME_MARKERS: &[&str] = &[
        "screen record",
        "screenrecord",
        "obs studio",
        "bandicam",
        "sharex",
        "shadowplay",
        "nvidia share",
        "gameplay",
        "generate resources",
        "generate resource",
    ];

    PERSONAL_NAME_MARKERS
        .iter()
        .any(|marker| lower_name.contains(marker))
        || lower_name.contains("фон")
        || lower_name.contains("обои")
        || lower_name.contains("wallpaper")
        || lower_name.contains("background")
        || lower_name.contains("screensaver")
        || file_name.contains('\u{1F300}')
        || regex_date_in_name(file_name)
}

fn regex_date_in_name(file_name: &str) -> bool {
    let bytes = file_name.as_bytes();
    for window in bytes.windows(10) {
        if window.len() >= 10
            && window[0].is_ascii_digit()
            && window[1].is_ascii_digit()
            && window[2].is_ascii_digit()
            && window[3].is_ascii_digit()
            && window[4] == b'-'
            && window[5].is_ascii_digit()
            && window[6].is_ascii_digit()
            && window[7] == b'-'
            && window[8].is_ascii_digit()
            && window[9].is_ascii_digit()
        {
            return true;
        }
    }
    false
}

pub fn is_likely_short_sfx(path: &Path, file_name: &str, file_size: u64) -> bool {
    let ext = get_extension_info(file_name);
    if ext.compound_extension != ".wav" {
        return false;
    }
    let suspicious = is_suspicious_asset_path(path);
    if suspicious && file_size < 5 * 1024 * 1024 {
        return true;
    }
    if let Some(duration) = read_wav_duration_secs(path) {
        if duration < 10.0 {
            return true;
        }
        if duration < 30.0 && suspicious {
            return true;
        }
        if duration < 60.0 && suspicious {
            return true;
        }
    } else if suspicious && file_size < 2 * 1024 * 1024 {
        return true;
    }
    false
}

pub fn should_skip_media_file(path: &Path) -> Option<SkipReason> {
    let file_name = path.file_name()?.to_str()?;
    let extension_info = get_extension_info(file_name);

    if is_always_ignored_file(file_name, &extension_info) {
        return Some(SkipReason::SourceCodeFile);
    }

    if is_test_or_fixture_path(path) || is_likely_test_fixture_file(file_name) {
        return Some(SkipReason::TestFixture);
    }

    if is_likely_personal_or_junk_media(file_name, path) {
        return Some(SkipReason::PersonalMedia);
    }

    if is_suspicious_asset_path(path) && detect_media_kind_from_extension(&extension_info).is_none()
    {
        return Some(SkipReason::DevFolder);
    }

    let ext = normalize_ext(&extension_info.compound_extension);
    if ext == ".ts" || ext == ".dts" {
        return Some(SkipReason::AmbiguousExtension);
    }

    if detect_media_kind_from_extension(&extension_info).is_none() {
        return Some(SkipReason::UnsupportedExtension);
    }

    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return Some(SkipReason::UnsupportedExtension);
    }

    if is_likely_short_sfx(path, file_name, metadata.len()) {
        return Some(SkipReason::ShortSfx);
    }

    if is_suspicious_asset_path(path) && ext == ".wav" {
        return Some(SkipReason::ShortSfx);
    }

    None
}

pub fn should_include_cached_media_item(file_path: &str, file_name: &str) -> bool {
    let path = PathBuf::from(file_path);
    if file_name.to_lowercase().ends_with(".d.ts") || file_path.to_lowercase().ends_with(".d.ts") {
        return false;
    }
    should_skip_media_file(&path).is_none()
}

pub fn probe_confirms_media_kind(
    ffprobe: &Path,
    path: &Path,
    expected: crate::models::MediaKind,
) -> bool {
    use crate::services::process_util::hidden_command;
    let output = hidden_command(ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            &path.to_string_lossy(),
        ])
        .output();
    let Ok(output) = output else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return false;
    };
    let streams = json
        .get("streams")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    match expected {
        crate::models::MediaKind::Video => streams
            .iter()
            .any(|s| s.get("codec_type").and_then(|v| v.as_str()) == Some("video")),
        crate::models::MediaKind::Audio => streams
            .iter()
            .any(|s| s.get("codec_type").and_then(|v| v.as_str()) == Some("audio")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn d_ts_is_source_code_not_video() {
        let info = get_extension_info("AcceleratedRendererSettings.d.ts");
        assert_eq!(info.compound_extension, ".d.ts");
        assert!(is_always_ignored_file(
            "AcceleratedRendererSettings.d.ts",
            &info
        ));
        assert!(detect_media_kind_from_extension(&info).is_none());
    }

    #[test]
    fn action_d_ts_skipped() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("action.d.ts");
        std::fs::File::create(&file).unwrap();
        assert_eq!(
            should_skip_media_file(&file),
            Some(SkipReason::SourceCodeFile)
        );
    }

    #[test]
    fn add_captions_d_ts_skipped() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("AddCaptionsStartPoint.d.ts");
        std::fs::File::create(&file).unwrap();
        assert_eq!(
            should_skip_media_file(&file),
            Some(SkipReason::SourceCodeFile)
        );
    }

    #[test]
    fn codec_test_vectors_in_tests_data_skipped() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("tests").join("data");
        std::fs::create_dir_all(&nested).unwrap();
        let file = nested.join("Test-44100hz-2ch-32bit-Float-Be.wav");
        std::fs::File::create(&file).unwrap();
        assert_eq!(should_skip_media_file(&file), Some(SkipReason::TestFixture));
    }

    #[test]
    fn test_fixture_name_skipped_even_outside_tests_dir() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("Test-8000hz-Le-3ch-5s-24bit.wav");
        std::fs::File::create(&file).unwrap();
        assert_eq!(should_skip_media_file(&file), Some(SkipReason::TestFixture));
    }

    #[test]
    fn short_wav_in_asset_folder_skipped() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("dvaaudiofilters").join("wav");
        std::fs::create_dir_all(&nested).unwrap();
        let file = nested.join("80azright.wav");
        let mut f = std::fs::File::create(&file).unwrap();
        // minimal RIFF/WAVE ~0.1s at 44100Hz mono 16-bit
        let sample_rate = 44100u32;
        let channels = 1u16;
        let bits = 16u16;
        let byte_rate = sample_rate * channels as u32 * (bits as u32 / 8);
        let data_bytes = (byte_rate as f64 * 0.1) as u32;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_bytes).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&channels.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        wav.extend_from_slice(&((channels * bits) / 8).to_le_bytes());
        wav.extend_from_slice(&bits.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_bytes.to_le_bytes());
        wav.extend(std::iter::repeat(0u8).take(data_bytes as usize));
        f.write_all(&wav).unwrap();
        assert_eq!(should_skip_media_file(&file), Some(SkipReason::ShortSfx));
    }

    #[test]
    fn real_mkv_not_skipped() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("episode.mkv");
        std::fs::File::create(&file)
            .unwrap()
            .write_all(b"x")
            .unwrap();
        assert!(should_skip_media_file(&file).is_none());
    }

    #[test]
    fn ambiguous_ts_without_probe_skipped() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("stream.ts");
        std::fs::File::create(&file).unwrap();
        assert_eq!(
            should_skip_media_file(&file),
            Some(SkipReason::AmbiguousExtension)
        );
    }

    #[test]
    fn screen_recording_timestamp_skipped() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("2026-05-31 02-26.mp4");
        std::fs::File::create(&file).unwrap();
        assert_eq!(
            should_skip_media_file(&file),
            Some(SkipReason::PersonalMedia)
        );
    }

    #[test]
    fn youtube_counter_filename_skipped() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("(5) Random Video.mp4");
        std::fs::File::create(&file).unwrap();
        assert_eq!(
            should_skip_media_file(&file),
            Some(SkipReason::PersonalMedia)
        );
    }
}
