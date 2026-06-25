use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageConfidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageSource {
    Folder,
    Filename,
    Metadata,
    Content,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleLanguageResult {
    pub code: String,
    pub label: String,
    pub confidence: LanguageConfidence,
    pub source: LanguageSource,
}

impl SubtitleLanguageResult {
    fn known(
        code: &str,
        label: &str,
        confidence: LanguageConfidence,
        source: LanguageSource,
    ) -> Self {
        Self {
            code: code.to_string(),
            label: label.to_string(),
            confidence,
            source,
        }
    }

    pub fn unknown() -> Self {
        Self {
            code: "und".to_string(),
            label: "Unknown language".to_string(),
            confidence: LanguageConfidence::Low,
            source: LanguageSource::Unknown,
        }
    }
}

pub fn language_label(code: &str) -> String {
    match code {
        "en" => "English".to_string(),
        "ru" => "Russian".to_string(),
        "ja" => "Japanese".to_string(),
        "de" => "German".to_string(),
        "fr" => "French".to_string(),
        "es" => "Spanish".to_string(),
        "ko" => "Korean".to_string(),
        "zh" => "Chinese".to_string(),
        "und" => "Unknown language".to_string(),
        other => other.to_uppercase(),
    }
}

fn detect_from_path_segments(path: &Path) -> Option<SubtitleLanguageResult> {
    let mut parts: Vec<String> = Vec::new();
    for comp in path.components() {
        if let std::path::Component::Normal(s) = comp {
            parts.push(s.to_string_lossy().to_lowercase());
        }
    }
    for part in parts {
        if let Some(lang) = detect_from_folder_token(&part) {
            return Some(lang);
        }
    }
    None
}

fn detect_from_folder_token(token: &str) -> Option<SubtitleLanguageResult> {
    let lower = token.to_lowercase();
    let ru_markers = [
        "rus subs",
        "russian subs",
        "rus sub",
        "russian sub",
        "русские",
        "русские суб",
        "рус",
        "сабы",
        "суб",
        "rus",
        "russian",
    ];
    for m in ru_markers {
        if lower.contains(m) {
            return Some(SubtitleLanguageResult::known(
                "ru",
                "Russian",
                LanguageConfidence::High,
                LanguageSource::Folder,
            ));
        }
    }
    if lower == "ru" || lower.starts_with("ru ") || lower.ends_with(" ru") {
        return Some(SubtitleLanguageResult::known(
            "ru",
            "Russian",
            LanguageConfidence::High,
            LanguageSource::Folder,
        ));
    }
    let en_markers = [
        "eng subs",
        "english subs",
        "eng sub",
        "english sub",
        "english",
        "eng",
    ];
    for m in en_markers {
        if lower.contains(m) {
            return Some(SubtitleLanguageResult::known(
                "en",
                "English",
                LanguageConfidence::High,
                LanguageSource::Folder,
            ));
        }
    }
    if lower == "en" {
        return Some(SubtitleLanguageResult::known(
            "en",
            "English",
            LanguageConfidence::High,
            LanguageSource::Folder,
        ));
    }
    let ja_markers = ["jpn", "japanese", "日本語", "ja subs"];
    for m in ja_markers {
        if lower.contains(m) {
            return Some(SubtitleLanguageResult::known(
                "ja",
                "Japanese",
                LanguageConfidence::High,
                LanguageSource::Folder,
            ));
        }
    }
    let de_markers = ["deu", "ger", "german", "deutsch", "ger subs", "german subs"];
    for m in de_markers {
        if lower.contains(m) {
            return Some(SubtitleLanguageResult::known(
                "de",
                "German",
                LanguageConfidence::High,
                LanguageSource::Folder,
            ));
        }
    }
    None
}

fn detect_from_filename(file_name: &str) -> Option<SubtitleLanguageResult> {
    let lower = file_name.to_lowercase();
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let tokens: Vec<&str> = stem.split(&['.', '-', '_', ' '][..]).collect();
    for token in tokens {
        match token {
            "ru" | "rus" | "russian" => {
                return Some(SubtitleLanguageResult::known(
                    "ru",
                    "Russian",
                    LanguageConfidence::High,
                    LanguageSource::Filename,
                ));
            }
            "en" | "eng" | "english" => {
                return Some(SubtitleLanguageResult::known(
                    "en",
                    "English",
                    LanguageConfidence::High,
                    LanguageSource::Filename,
                ));
            }
            "ja" | "jpn" | "japanese" => {
                return Some(SubtitleLanguageResult::known(
                    "ja",
                    "Japanese",
                    LanguageConfidence::High,
                    LanguageSource::Filename,
                ));
            }
            "de" | "deu" | "ger" | "german" => {
                return Some(SubtitleLanguageResult::known(
                    "de",
                    "German",
                    LanguageConfidence::High,
                    LanguageSource::Filename,
                ));
            }
            _ => {}
        }
    }

    if lower.contains(".ru.") || lower.ends_with(".ru.srt") || lower.ends_with(".ru.ass") {
        return Some(SubtitleLanguageResult::known(
            "ru",
            "Russian",
            LanguageConfidence::Medium,
            LanguageSource::Filename,
        ));
    }
    None
}

pub fn count_script_chars(text: &str) -> (u32, u32, u32, u32) {
    let mut cyrillic = 0u32;
    let mut latin = 0u32;
    let mut japanese = 0u32;
    let mut german_special = 0u32;
    for ch in text.chars() {
        if ('\u{0400}'..='\u{04FF}').contains(&ch) {
            cyrillic += 1;
        } else if ch.is_ascii_alphabetic() {
            latin += 1;
            if matches!(ch, 'ä' | 'ö' | 'ü' | 'ß' | 'Ä' | 'Ö' | 'Ü') {
                german_special += 1;
            }
        } else if ('\u{3040}'..='\u{30FF}').contains(&ch) || ('\u{4E00}'..='\u{9FFF}').contains(&ch)
        {
            japanese += 1;
        }
    }
    (cyrillic, latin, japanese, german_special)
}

/// Infer ISO 639-1 language code from subtitle text (script heuristics).
pub fn detect_language_from_text(text: &str) -> Option<String> {
    let sample: String = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.contains("-->"))
        .take(80)
        .collect::<Vec<_>>()
        .join(" ");
    if sample.len() < 8 {
        return None;
    }
    let (cyrillic, latin, japanese, german_special) = count_script_chars(&sample);
    if cyrillic >= 12 && cyrillic > latin && cyrillic > japanese {
        return Some("ru".to_string());
    }
    if japanese >= 8 && japanese > cyrillic {
        return Some("ja".to_string());
    }
    if german_special >= 3 {
        return Some("de".to_string());
    }
    if latin >= 20 && latin > cyrillic && latin > japanese {
        return Some("en".to_string());
    }
    None
}

pub fn detect_language_from_cue_texts<'a, I>(lines: I) -> Option<String>
where
    I: IntoIterator<Item = &'a str>,
{
    let sample: String = lines
        .into_iter()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(50)
        .collect::<Vec<_>>()
        .join(" ");
    detect_language_from_text(&sample)
}

pub fn detect_from_content(path: &Path) -> Option<SubtitleLanguageResult> {
    let mut file = File::open(path).ok()?;
    let mut buf = vec![0u8; 64 * 1024];
    let read = file.read(&mut buf).ok()?;
    buf.truncate(read);
    let text = String::from_utf8_lossy(&buf);
    let sample: String = text
        .lines()
        .filter(|l| !l.trim().is_empty() && !l.contains("-->"))
        .take(50)
        .collect::<Vec<_>>()
        .join(" ");
    if sample.len() < 8 {
        return None;
    }
    match detect_language_from_text(&sample).as_deref() {
        Some("ru") => Some(SubtitleLanguageResult::known(
            "ru",
            "Russian",
            LanguageConfidence::Medium,
            LanguageSource::Content,
        )),
        Some("ja") => Some(SubtitleLanguageResult::known(
            "ja",
            "Japanese",
            LanguageConfidence::Medium,
            LanguageSource::Content,
        )),
        Some("de") => Some(SubtitleLanguageResult::known(
            "de",
            "German",
            LanguageConfidence::Low,
            LanguageSource::Content,
        )),
        Some("en") => Some(SubtitleLanguageResult::known(
            "en",
            "English",
            LanguageConfidence::Low,
            LanguageSource::Content,
        )),
        _ => None,
    }
}

pub fn detect_subtitle_language(subtitle_path: &Path) -> SubtitleLanguageResult {
    if let Some(found) = detect_from_path_segments(subtitle_path) {
        eprintln!(
            "[Virelia subtitles] lang {:?} from folder path {}",
            found,
            subtitle_path.display()
        );
        return found;
    }

    let file_name = subtitle_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if let Some(found) = detect_from_filename(file_name) {
        eprintln!(
            "[Virelia subtitles] lang {:?} from filename {}",
            found, file_name
        );
        return found;
    }

    if let Some(found) = detect_from_content(subtitle_path) {
        eprintln!(
            "[Virelia subtitles] lang {:?} from content {}",
            found,
            subtitle_path.display()
        );
        return found;
    }

    SubtitleLanguageResult::unknown()
}

pub fn external_display_label(lang: &SubtitleLanguageResult, file_name: &str) -> String {
    if lang.code == "und" {
        format!("Unknown language — {file_name}")
    } else {
        format!("{} — {file_name}", lang.label)
    }
}

pub fn normalize_metadata_language(code: &str) -> SubtitleLanguageResult {
    let lower = code.trim().to_lowercase();
    let mapped = match lower.as_str() {
        "ru" | "rus" | "russian" => Some(("ru", "Russian")),
        "en" | "eng" | "english" => Some(("en", "English")),
        "ja" | "jpn" | "japanese" => Some(("ja", "Japanese")),
        "de" | "deu" | "ger" | "german" => Some(("de", "German")),
        "fr" | "fra" | "fre" | "french" => Some(("fr", "French")),
        "es" | "spa" | "spanish" => Some(("es", "Spanish")),
        "ko" | "kor" | "korean" => Some(("ko", "Korean")),
        "zh" | "chi" | "zho" | "chinese" => Some(("zh", "Chinese")),
        _ => None,
    };
    if let Some((code, label)) = mapped {
        SubtitleLanguageResult::known(
            code,
            label,
            LanguageConfidence::High,
            LanguageSource::Metadata,
        )
    } else if lower.len() == 2 || lower.len() == 3 {
        let label = language_label(&lower);
        SubtitleLanguageResult::known(
            &lower,
            &label,
            LanguageConfidence::Medium,
            LanguageSource::Metadata,
        )
    } else {
        SubtitleLanguageResult::unknown()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn detects_ja_from_cue_text() {
        let sample = "こんにちは、元気ですか？今日はいい天気ですね。";
        assert_eq!(detect_language_from_text(sample).as_deref(), Some("ja"));
    }

    #[test]
    fn detects_ru_from_cue_text() {
        let sample = "Привет, как дела? Сегодня хорошая погода.";
        assert_eq!(detect_language_from_text(sample).as_deref(), Some("ru"));
    }

    #[test]
    fn detects_rus_subs_folder_in_path() {
        let path = PathBuf::from(r"D:\anime\Rus subs\EP01.srt");
        let lang = detect_subtitle_language(&path);
        assert_eq!(lang.code, "ru");
        assert_eq!(lang.confidence, LanguageConfidence::High);
    }

    #[test]
    fn detects_ru_from_filename() {
        let path = PathBuf::from(r"D:\anime\movie.ru.srt");
        let lang = detect_subtitle_language(&path);
        assert_eq!(lang.code, "ru");
    }
}
