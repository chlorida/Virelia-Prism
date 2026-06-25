use crate::services::subtitle_cue::GeneratedSubtitleCue;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleCue {
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_non_speech: Option<bool>,
    pub layer: i32,
    pub margin_l: i32,
    pub margin_r: i32,
    pub margin_v: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effect: Option<String>,
}

pub fn parse_ass_cues(raw: &str) -> Vec<SubtitleCue> {
    let lines = raw
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .split('\n')
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut in_events = false;
    let mut format_cols: Vec<String> = Vec::new();
    let mut cues = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed.eq_ignore_ascii_case("[Events]") {
            in_events = true;
            continue;
        }
        if trimmed.starts_with('[') && !trimmed.eq_ignore_ascii_case("[Events]") {
            in_events = false;
            continue;
        }
        if !in_events {
            continue;
        }
        if trimmed.to_ascii_lowercase().starts_with("format:") {
            format_cols = trimmed
                .split_once(':')
                .map(|(_, rest)| rest)
                .unwrap_or("")
                .split(',')
                .map(|c| c.trim().to_ascii_lowercase())
                .collect();
            continue;
        }
        if !trimmed.to_ascii_lowercase().starts_with("dialogue:") {
            continue;
        }
        let body = trimmed.split_once(':').map(|(_, rest)| rest).unwrap_or("");
        let parts = split_ass_fields(body, format_cols.len().max(9));
        if format_cols.is_empty() {
            format_cols = vec![
                "layer".into(),
                "start".into(),
                "end".into(),
                "style".into(),
                "name".into(),
                "marginl".into(),
                "marginr".into(),
                "marginv".into(),
                "effect".into(),
                "text".into(),
            ];
        }
        let idx = |name: &str| format_cols.iter().position(|c| c == name);
        let start_idx = idx("start").unwrap_or(1);
        let end_idx = idx("end").unwrap_or(2);
        let style_idx = idx("style").unwrap_or(3);
        let name_idx = idx("name").unwrap_or(4);
        let text_idx = idx("text").unwrap_or(format_cols.len().saturating_sub(1));
        let layer_idx = idx("layer").unwrap_or(0);
        let ml_idx = idx("marginl");
        let mr_idx = idx("marginr");
        let mv_idx = idx("marginv");
        let effect_idx = idx("effect");

        let start = ass_time_to_seconds(parts.get(start_idx).map(String::as_str).unwrap_or(""));
        let end = ass_time_to_seconds(parts.get(end_idx).map(String::as_str).unwrap_or(""));
        let raw_text = parts.get(text_idx).cloned().unwrap_or_default();
        let text = strip_ass_tags(&raw_text);
        if !start.is_finite() || !end.is_finite() || end <= start || text.trim().is_empty() {
            continue;
        }
        let style_name = parts.get(style_idx).cloned().filter(|s| !s.is_empty());
        let speaker = parts
            .get(name_idx)
            .cloned()
            .filter(|s| !s.is_empty() && s != "NTP" && s != "Default");
        cues.push(SubtitleCue {
            start,
            end,
            text: text.trim().to_string(),
            raw_text: Some(raw_text),
            source_language: None,
            speaker,
            style_name,
            confidence: None,
            is_non_speech: None,
            layer: parts
                .get(layer_idx)
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            margin_l: ml_idx
                .and_then(|i| parts.get(i))
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            margin_r: mr_idx
                .and_then(|i| parts.get(i))
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            margin_v: mv_idx
                .and_then(|i| parts.get(i))
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            effect: effect_idx.and_then(|i| parts.get(i)).cloned(),
        });
    }
    cues.sort_by(|a, b| {
        a.start
            .partial_cmp(&b.start)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    cues
}

pub fn subtitle_cues_to_generated(
    cues: &[SubtitleCue],
    source_language: Option<String>,
) -> Vec<GeneratedSubtitleCue> {
    cues.iter()
        .map(|c| GeneratedSubtitleCue {
            start: c.start,
            end: c.end,
            text: c.text.clone(),
            source_text: Some(c.text.clone()),
            source_language: source_language.clone(),
            target_language: String::new(),
            is_translated: false,
            language_confidence: c.confidence,
            speaker: c.speaker.clone(),
            style_name: c.style_name.clone(),
            color: None,
            outline_color: None,
            raw_text: c.raw_text.clone(),
            layer: Some(c.layer),
            margin_l: Some(c.margin_l),
            margin_r: Some(c.margin_r),
            margin_v: Some(c.margin_v),
            effect: c.effect.clone(),
        })
        .collect()
}

fn split_ass_fields(body: &str, field_count: usize) -> Vec<String> {
    let count = field_count.max(1);
    let mut out = Vec::new();
    let mut rest = body;
    for _ in 0..count.saturating_sub(1) {
        let Some(idx) = rest.find(',') else {
            break;
        };
        out.push(rest[..idx].trim().to_string());
        rest = &rest[idx + 1..];
    }
    out.push(rest.trim().to_string());
    out
}

pub fn ass_time_to_seconds(raw: &str) -> f64 {
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() != 3 {
        return f64::NAN;
    }
    let h: f64 = parts[0].parse().unwrap_or(0.0);
    let m: f64 = parts[1].parse().unwrap_or(0.0);
    let sec = parts[2].replace(',', ".");
    let s: f64 = sec.parse().unwrap_or(f64::NAN);
    if !s.is_finite() {
        return f64::NAN;
    }
    h * 3600.0 + m * 60.0 + s
}

pub fn strip_ass_tags(text: &str) -> String {
    let mut out = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            while let Some(nc) = chars.next() {
                if nc == '}' {
                    break;
                }
            }
            continue;
        }
        if c == '\\' {
            if let Some(&next) = chars.peek() {
                match next {
                    'N' | 'n' => {
                        chars.next();
                        out.push('\n');
                        continue;
                    }
                    'h' => {
                        chars.next();
                        out.push(' ');
                        continue;
                    }
                    _ => {}
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ass_dialogue_with_speaker() {
        let ass = r#"
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Sonic,Sonic,0,0,0,,{\an8}Hey Tails!
"#;
        let cues = parse_ass_cues(ass);
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].speaker.as_deref(), Some("Sonic"));
        assert_eq!(cues[0].style_name.as_deref(), Some("Sonic"));
        assert_eq!(cues[0].text, "Hey Tails!");
    }
}
