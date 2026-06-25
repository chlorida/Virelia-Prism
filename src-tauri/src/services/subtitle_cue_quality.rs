use crate::services::subtitle_cue::GeneratedSubtitleCue;

pub const GENERATION_PIPELINE_VERSION: u32 = 5;

#[derive(Debug, Clone, Default)]

pub struct CueQualityStats {
    pub cue_count: usize,

    pub speech_cue_count: usize,

    pub non_speech_cue_count: usize,

    pub speech_duration: f64,

    pub total_duration: f64,

    pub repeated_cue_count: usize,
}

const NON_SPEECH_TAGS: &[&str] = &[
    "music",
    "bgm",
    "song",
    "singing",
    "moaning",
    "groaning",
    "sigh",
    "sighs",
    "laughs",
    "laughing",
    "crying",
    "applause",
    "clapping",
    "noise",
    "sound",
    "silence",
    "background music",
    "laughter",
    "instrumental",
    "музыка",
    "песня",
    "стон",
    "стонет",
    "вздох",
    "смех",
    "плач",
    "аплодисменты",
    "шум",
    "звук",
    "тишина",
    "смех",
    "chuckle",
    "chuckles",
    "giggle",
    "giggles",
];

fn is_hallucinated_bracket_label(text: &str) -> bool {
    let trimmed = text.trim();

    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return false;
    }

    let inner = trimmed[1..trimmed.len().saturating_sub(1)].trim();

    let inner_lower = inner.to_lowercase();

    let has_cjk = inner
        .chars()
        .any(|c| ('\u{3040}'..='\u{30ff}').contains(&c) || ('\u{4e00}'..='\u{9fff}').contains(&c));

    if has_cjk {
        return false;
    }

    let actions = [
        "chuckle", "chuckles", "laugh", "laughs", "laughing", "giggle", "giggles", "sigh", "sighs",
        "cough", "applause", "clapping", "moaning", "groaning",
    ];

    let has_action = actions.iter().any(|a| inner_lower.contains(a));

    if has_action {
        let parts: Vec<&str> = inner_lower.split_whitespace().collect();

        if parts.len() >= 2 {
            let first = parts[0];

            let looks_like_name = first
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');

            if looks_like_name {
                return true;
            }
        }

        if parts.len() <= 4 {
            return true;
        }
    }

    false
}

pub fn is_non_speech_cue(text: &str) -> bool {
    let trimmed = text.trim();

    if trimmed.is_empty() {
        return true;
    }

    if is_hallucinated_bracket_label(trimmed) {
        return true;
    }

    let lower = trimmed.to_lowercase();

    let stripped = lower
        .trim_matches(|c: char| c == '[' || c == ']' || c == '(' || c == ')')
        .trim();

    if NON_SPEECH_TAGS.iter().any(|tag| stripped == *tag) {
        return true;
    }

    if trimmed
        .chars()
        .all(|c| matches!(c, '♪' | '♫' | '♬' | '♩') || c.is_whitespace())
    {
        return true;
    }

    if trimmed.len() <= 28 && (trimmed.starts_with('[') || trimmed.starts_with('(')) {
        if stripped.len() <= 24 && NON_SPEECH_TAGS.iter().any(|tag| stripped.contains(tag)) {
            return true;
        }
    }

    false
}

pub fn analyze_cues(cues: &[GeneratedSubtitleCue]) -> CueQualityStats {
    let mut stats = CueQualityStats::default();

    stats.cue_count = cues.len();

    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for cue in cues {
        let dur = (cue.end - cue.start).max(0.0);

        stats.total_duration += dur;

        if is_non_speech_cue(&cue.text) {
            stats.non_speech_cue_count += 1;
        } else {
            stats.speech_cue_count += 1;

            stats.speech_duration += dur;
        }

        *counts.entry(cue.text.trim().to_lowercase()).or_insert(0) += 1;
    }

    stats.repeated_cue_count = counts.values().filter(|&&n| n > 3).count();

    stats
}

pub fn filter_non_speech_cues(cues: &mut Vec<GeneratedSubtitleCue>, show_sound_labels: bool) {
    cues.retain(|cue| {
        if is_hallucinated_bracket_label(&cue.text) {
            return false;
        }

        if show_sound_labels {
            return true;
        }

        !is_non_speech_cue(&cue.text)
    });
}

fn cue_contains_timestamp_markup(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.starts_with("WEBVTT") {
        return true;
    }
    trimmed.contains("-->") && trimmed.contains(':')
}

pub fn detect_repeated_hallucinations(cues: &[GeneratedSubtitleCue]) -> (usize, usize, f64) {
    let mut speech: Vec<String> = Vec::new();
    for cue in cues {
        if is_non_speech_cue(&cue.text) || cue_contains_timestamp_markup(&cue.text) {
            continue;
        }
        let normalized = cue
            .text
            .to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if !normalized.is_empty() {
            speech.push(normalized);
        }
    }
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for text in &speech {
        *counts.entry(text.clone()).or_insert(0) += 1;
    }
    let repeat_count = counts.values().copied().max().unwrap_or(0);
    let mut consecutive = 0usize;
    let mut max_consecutive = 0usize;
    let mut prev = String::new();
    for text in &speech {
        if text == &prev {
            consecutive += 1;
            max_consecutive = max_consecutive.max(consecutive);
        } else {
            consecutive = 1;
            prev = text.clone();
        }
    }
    let ratio = if speech.is_empty() {
        0.0
    } else {
        repeat_count as f64 / speech.len() as f64
    };
    (repeat_count, max_consecutive, ratio)
}

#[derive(Debug, Clone, Default)]
pub struct CoverageValidation {
    pub total_cue_duration: f64,
    pub coverage_ratio: f64,
    pub first_cue_start: Option<f64>,
    pub last_cue_end: Option<f64>,
    pub longest_gap: Option<f64>,
}

pub fn compute_coverage_stats(
    cues: &[GeneratedSubtitleCue],
    video_duration: f64,
) -> CoverageValidation {
    let mut total_cue_duration = 0.0f64;
    let mut first_cue_start: Option<f64> = None;
    let mut last_cue_end: Option<f64> = None;
    let mut longest_gap: Option<f64> = None;
    let mut prev_end: Option<f64> = None;

    for cue in cues {
        if is_non_speech_cue(&cue.text) {
            continue;
        }
        let dur = (cue.end - cue.start).max(0.0);
        total_cue_duration += dur;
        first_cue_start = Some(first_cue_start.unwrap_or(cue.start).min(cue.start));
        last_cue_end = Some(last_cue_end.unwrap_or(cue.end).max(cue.end));
        if let Some(prev) = prev_end {
            let gap = (cue.start - prev).max(0.0);
            longest_gap = Some(longest_gap.unwrap_or(gap).max(gap));
        }
        prev_end = Some(cue.end);
    }

    let coverage_ratio = if video_duration > 0.0 {
        total_cue_duration / video_duration
    } else {
        0.0
    };

    CoverageValidation {
        total_cue_duration,
        coverage_ratio,
        first_cue_start,
        last_cue_end,
        longest_gap,
    }
}

pub fn validate_generated_coverage(
    cues: &[GeneratedSubtitleCue],
    stats: &CueQualityStats,
    video_duration: Option<f64>,
    raw_byte_len: Option<usize>,
) -> Result<CoverageValidation, String> {
    let duration = video_duration.unwrap_or(0.0);

    if duration <= 0.0 {
        if stats.cue_count <= 1 {
            return Err("too-few-cues".to_string());
        }
        return Ok(compute_coverage_stats(cues, duration));
    }

    if duration > 60.0 && stats.cue_count <= 1 {
        return Err("too-few-cues".to_string());
    }

    if let Some(raw_len) = raw_byte_len {
        if duration > 300.0 && raw_len < 500 {
            return Err("output-too-small".to_string());
        }
    }

    if duration > 300.0 {
        if stats.cue_count < 5 {
            return Err("too-few-cues".to_string());
        }
        if stats.speech_cue_count < 5 {
            return Err("too-few-cues".to_string());
        }
    }

    if duration > 1200.0 && stats.cue_count < 20 {
        return Err("too-few-cues".to_string());
    }

    if duration <= 60.0 {
        return Ok(compute_coverage_stats(cues, duration));
    }

    let coverage = compute_coverage_stats(cues, duration);
    if coverage.coverage_ratio < 0.05 {
        return Err("low-coverage".to_string());
    }

    if duration > 300.0 {
        if let Some(last) = coverage.last_cue_end {
            if last < 60.0 && stats.cue_count <= 3 {
                return Err("low-coverage".to_string());
            }
        }
    }

    Ok(coverage)
}

pub fn validate_generated_subtitles(
    cues: &[GeneratedSubtitleCue],
    video_duration: Option<f64>,
    raw_byte_len: Option<usize>,
) -> Result<CueQualityStats, String> {
    let stats = analyze_cues(cues);

    if stats.cue_count == 0 {
        return Err("generated_no_speech".to_string());
    }

    if cues
        .iter()
        .any(|cue| cue_contains_timestamp_markup(&cue.text))
    {
        return Err("generated_raw_vtt_in_cues".to_string());
    }

    let hallucinated_count = cues
        .iter()
        .filter(|cue| is_hallucinated_bracket_label(&cue.text))
        .count();

    if stats.speech_cue_count == 0 {
        if hallucinated_count > 0 {
            return Err("hallucinated_sound_labels".to_string());
        }
        return Err("generated_mostly_non_speech".to_string());
    }

    if hallucinated_count >= 3
        && stats.cue_count > 0
        && (hallucinated_count as f64 / stats.cue_count as f64) > 0.35
    {
        return Err("hallucinated_sound_labels".to_string());
    }

    let (repeat_count, max_consecutive, ratio) = detect_repeated_hallucinations(cues);
    if repeat_count >= 8 || max_consecutive >= 4 || (cues.len() >= 8 && ratio > 0.55) {
        return Err("repeated_hallucinated_text".to_string());
    }

    let non_speech_ratio = stats.non_speech_cue_count as f64 / stats.cue_count as f64;

    if non_speech_ratio > 0.5 {
        return Err("generated_mostly_non_speech".to_string());
    }

    if stats.cue_count >= 10
        && stats.speech_cue_count < 3
        && (stats.speech_cue_count as f64 / stats.cue_count as f64) < 0.2
    {
        return Err("generated_no_speech".to_string());
    }

    let unique: std::collections::HashSet<_> = cues.iter().map(|c| c.text.trim()).collect();

    if unique.len() == 1 && stats.speech_cue_count > 0 {
        let only = cues.first().map(|c| c.text.as_str()).unwrap_or("");

        if is_non_speech_cue(only) {
            return Err("generated_mostly_non_speech".to_string());
        }
    }

    validate_generated_coverage(cues, &stats, video_duration, raw_byte_len)?;

    Ok(stats)
}

#[cfg(test)]

mod tests {

    use super::*;

    #[test]

    fn detects_music_and_moaning_tags() {
        assert!(is_non_speech_cue("[MUSIC]"));

        assert!(is_non_speech_cue("[moaning]"));

        assert!(is_non_speech_cue("[стон]"));

        assert!(!is_non_speech_cue("Hello world"));
    }

    #[test]

    fn rejects_music_only_track() {
        let cues = vec![
            GeneratedSubtitleCue {
                start: 0.0,

                end: 2.0,

                text: "[MUSIC]".into(),

                source_text: Some("[MUSIC]".into()),

                target_language: "en".into(),

                ..Default::default()
            },
            GeneratedSubtitleCue {
                start: 2.0,

                end: 4.0,

                text: "[moaning]".into(),

                source_text: Some("[moaning]".into()),

                target_language: "en".into(),

                ..Default::default()
            },
        ];

        assert!(validate_generated_subtitles(&cues, None, None).is_err());
    }

    #[test]

    fn accepts_mixed_music_and_speech() {
        let cues = vec![
            GeneratedSubtitleCue {
                start: 0.0,

                end: 2.0,

                text: "[MUSIC]".into(),

                source_text: Some("[MUSIC]".into()),

                target_language: "en".into(),

                ..Default::default()
            },
            GeneratedSubtitleCue {
                start: 2.0,

                end: 4.0,

                text: "Hello".into(),

                source_text: Some("Hello".into()),

                target_language: "en".into(),

                ..Default::default()
            },
            GeneratedSubtitleCue {
                start: 4.0,

                end: 6.0,

                text: "Good morning".into(),

                source_text: Some("Good morning".into()),

                target_language: "en".into(),

                ..Default::default()
            },
        ];

        assert!(validate_generated_subtitles(&cues, None, None).is_ok());
    }

    #[test]
    fn rejects_single_cue_for_long_video() {
        let cues = vec![GeneratedSubtitleCue {
            start: 1.0,
            end: 3.0,
            text: "Where are you?".into(),
            source_text: Some("Where are you?".into()),
            target_language: "en".into(),
            ..Default::default()
        }];
        let err = validate_generated_subtitles(&cues, Some(1421.0), Some(54))
            .err()
            .unwrap_or_default();
        assert_eq!(err, "too-few-cues");
    }

    #[test]
    fn accepts_reasonable_coverage_for_long_video() {
        let mut cues = Vec::new();
        for i in 0..40 {
            let start = i as f64 * 30.0;
            cues.push(GeneratedSubtitleCue {
                start,
                end: start + 2.5,
                text: format!("Line {i}"),
                source_text: Some(format!("Line {i}")),
                target_language: "en".into(),
                ..Default::default()
            });
        }
        assert!(validate_generated_subtitles(&cues, Some(1421.0), Some(4096)).is_ok());
    }
}
