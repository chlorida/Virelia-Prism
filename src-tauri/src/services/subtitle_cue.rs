use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSubtitleCue {
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_language: Option<String>,
    pub target_language: String,
    pub is_translated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language_confidence: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outline_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub margin_l: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub margin_r: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub margin_v: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effect: Option<String>,
}

pub fn parse_srt_cues(raw: &str) -> Vec<GeneratedSubtitleCue> {
    let normalized = raw.replace("\r\n", "\n");
    let mut cues = Vec::new();
    for block in normalized.split("\n\n") {
        let lines: Vec<&str> = block
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect();
        if lines.len() < 2 {
            continue;
        }
        let time_line = lines.iter().find(|l| l.contains("-->"));
        let Some(time_line) = time_line else { continue };
        let parts: Vec<&str> = time_line.split("-->").collect();
        if parts.len() != 2 {
            continue;
        }
        let start = parse_srt_time(parts[0].trim());
        let end = parse_srt_time(parts[1].trim());
        if !start.is_finite() || !end.is_finite() || end <= start {
            continue;
        }
        let time_idx = lines.iter().position(|l| *l == *time_line).unwrap_or(0);
        let text = lines[(time_idx + 1)..].join("\n");
        if text.trim().is_empty() {
            continue;
        }
        cues.push(GeneratedSubtitleCue {
            start,
            end,
            text: text.clone(),
            source_text: Some(text),
            ..Default::default()
        });
    }
    cues.sort_by(|a, b| {
        a.start
            .partial_cmp(&b.start)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    cues
}

fn is_vtt_timestamp_line(line: &str) -> bool {
    let trimmed = line.trim();
    if !trimmed.contains("-->") {
        return false;
    }
    let parts: Vec<&str> = trimmed.split("-->").collect();
    if parts.len() != 2 {
        return false;
    }
    parse_vtt_time(parts[0].trim()).is_finite()
        && parse_vtt_time(parts[1].trim().split_whitespace().next().unwrap_or("")).is_finite()
}

pub fn parse_vtt_cues(raw: &str) -> Vec<GeneratedSubtitleCue> {
    let normalized = raw.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mut cues = Vec::new();
    let mut i = 0usize;
    while i < lines.len() && !lines[i].trim().starts_with("WEBVTT") {
        i += 1;
    }
    if i < lines.len() {
        i += 1;
    }

    while i < lines.len() {
        while i < lines.len() && lines[i].trim().is_empty() {
            i += 1;
        }
        if i >= lines.len() {
            break;
        }
        if !is_vtt_timestamp_line(lines[i]) {
            i += 1;
            continue;
        }
        let parts: Vec<&str> = lines[i].trim().split("-->").collect();
        let start = parse_vtt_time(parts[0].trim());
        let end = parse_vtt_time(parts[1].trim().split_whitespace().next().unwrap_or(""));
        if !start.is_finite() || !end.is_finite() || end <= start {
            i += 1;
            continue;
        }
        i += 1;
        let mut text_lines: Vec<String> = Vec::new();
        while i < lines.len() {
            let trimmed = lines[i].trim();
            if is_vtt_timestamp_line(lines[i]) {
                break;
            }
            if trimmed.is_empty() {
                let next = lines.get(i + 1).map(|l| l.trim()).unwrap_or("");
                if is_vtt_timestamp_line(next) {
                    break;
                }
                if !text_lines.is_empty() {
                    break;
                }
                i += 1;
                continue;
            }
            text_lines.push(lines[i].trim_end().to_string());
            i += 1;
        }
        let text = text_lines.join("\n").trim().to_string();
        if !text.is_empty() {
            cues.push(GeneratedSubtitleCue {
                start,
                end,
                text: text.clone(),
                source_text: Some(text),
                ..Default::default()
            });
        }
    }
    cues.sort_by(|a, b| {
        a.start
            .partial_cmp(&b.start)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    cues
}

pub fn detect_subtitle_file_format(raw: &str, hint: &str) -> &'static str {
    let trimmed = raw.trim_start();
    if trimmed.starts_with("WEBVTT") {
        return "vtt";
    }
    if trimmed.starts_with("[Script Info]")
        || trimmed.contains("[Events]")
        || trimmed.contains("Dialogue:")
    {
        return "ass";
    }
    if hint.eq_ignore_ascii_case("ass") || hint.eq_ignore_ascii_case("ssa") {
        return "ass";
    }
    if hint.eq_ignore_ascii_case("vtt") {
        return "vtt";
    }
    "srt"
}

pub fn parse_subtitle_file_cues(raw: &str, format: &str) -> Vec<GeneratedSubtitleCue> {
    let detected = detect_subtitle_file_format(raw, format);
    match detected {
        "vtt" => parse_vtt_cues(raw),
        "ass" => {
            use crate::services::subtitle_ass_parser::{
                parse_ass_cues, subtitle_cues_to_generated,
            };
            subtitle_cues_to_generated(&parse_ass_cues(raw), None)
        }
        _ => parse_srt_cues(raw),
    }
}

pub fn write_vtt(cues: &[GeneratedSubtitleCue]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for cue in cues {
        out.push_str(&format!(
            "{} --> {}\n{}\n\n",
            format_vtt_time(cue.start),
            format_vtt_time(cue.end),
            cue.text
        ));
    }
    out
}

fn parse_srt_time(raw: &str) -> f64 {
    parse_clock_time(raw.replace(',', ".").as_str())
}

fn parse_vtt_time(raw: &str) -> f64 {
    parse_clock_time(raw)
}

fn parse_clock_time(raw: &str) -> f64 {
    let parts: Vec<&str> = raw.split(':').collect();
    match parts.len() {
        3 => {
            let h: f64 = parts[0].parse().unwrap_or(0.0);
            let m: f64 = parts[1].parse().unwrap_or(0.0);
            let s: f64 = parts[2].parse().unwrap_or(0.0);
            h * 3600.0 + m * 60.0 + s
        }
        2 => {
            let m: f64 = parts[0].parse().unwrap_or(0.0);
            let s: f64 = parts[1].parse().unwrap_or(0.0);
            m * 60.0 + s
        }
        _ => f64::NAN,
    }
}

fn format_vtt_time(seconds: f64) -> String {
    let h = (seconds / 3600.0).floor() as u32;
    let m = ((seconds % 3600.0) / 60.0).floor() as u32;
    let s = seconds % 60.0;
    format!("{h:02}:{m:02}:{s:06.3}")
}
