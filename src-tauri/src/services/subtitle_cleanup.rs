use crate::services::subtitle_cue::GeneratedSubtitleCue;
use crate::services::subtitle_cue_quality::is_non_speech_cue;
use crate::services::subtitle_glossary::{apply_glossary, detect_glossary, NameStyle};
use std::path::Path;

pub fn normalize_cue_text(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn looks_like_hallucination(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }
    if trimmed.len() <= 2 && !trimmed.chars().any(|c| c.is_alphabetic()) {
        return true;
    }
    let alpha = trimmed.chars().filter(|c| c.is_alphabetic()).count();
    if alpha == 0 && !is_non_speech_cue(trimmed) {
        return true;
    }
    false
}

pub fn cleanup_transcription_cues(
    cues: &mut Vec<GeneratedSubtitleCue>,
    video_path: &Path,
    name_style: NameStyle,
) {
    let glossary = detect_glossary(video_path);
    for cue in cues.iter_mut() {
        let normalized = normalize_cue_text(&cue.text);
        let mut source = cue
            .source_text
            .clone()
            .unwrap_or_else(|| normalized.clone());
        source = normalize_cue_text(&source);
        if let Some(g) = glossary {
            source = apply_glossary(&source, g, name_style);
        }
        cue.source_text = Some(source.clone());
        cue.text = source;
        if cue.source_language.is_none() {
            cue.source_language = None;
        }
    }

    cues.retain(|cue| !looks_like_hallucination(&cue.text));

    merge_broken_segments(cues, 0.35);
}

fn merge_broken_segments(cues: &mut Vec<GeneratedSubtitleCue>, max_gap_secs: f64) {
    if cues.len() < 2 {
        return;
    }
    let mut merged: Vec<GeneratedSubtitleCue> = Vec::with_capacity(cues.len());
    for cue in cues.drain(..) {
        if let Some(last) = merged.last_mut() {
            let gap = cue.start - last.end;
            let short = cue.text.chars().count() <= 12;
            let last_short = last.text.chars().count() <= 12;
            if gap >= 0.0
                && gap <= max_gap_secs
                && short
                && last_short
                && !is_non_speech_cue(&cue.text)
                && !is_non_speech_cue(&last.text)
            {
                last.end = cue.end.max(last.end);
                last.text = format!("{} {}", last.text.trim(), cue.text.trim());
                if let Some(src) = &cue.source_text {
                    last.source_text = Some(format!(
                        "{} {}",
                        last.source_text.as_deref().unwrap_or(&last.text),
                        src.trim()
                    ));
                }
                continue;
            }
        }
        merged.push(cue);
    }
    *cues = merged;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cue(start: f64, end: f64, text: &str) -> GeneratedSubtitleCue {
        GeneratedSubtitleCue {
            start,
            end,
            text: text.into(),
            source_text: Some(text.into()),
            ..Default::default()
        }
    }

    #[test]
    fn merges_short_adjacent_segments() {
        let mut cues = vec![cue(0.0, 1.0, "Hello"), cue(1.1, 2.0, "there")];
        merge_broken_segments(&mut cues, 0.35);
        assert_eq!(cues.len(), 1);
        assert_eq!(cues[0].text, "Hello there");
    }
}
