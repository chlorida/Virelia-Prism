use crate::services::subtitle_cue::GeneratedSubtitleCue;
use crate::services::subtitle_franchise::FranchiseGlossary;
use std::collections::HashMap;

pub fn detect_speaker_from_text(
    text: &str,
    glossary: Option<&FranchiseGlossary>,
) -> Option<String> {
    let trimmed = text.trim();
    if let Some((name, _rest)) = trimmed.split_once(':') {
        let candidate = name.trim();
        if !candidate.is_empty() && candidate.len() < 40 {
            if let Some(g) = glossary {
                if let Some(resolved) = g.resolve_speaker(candidate) {
                    return Some(resolved);
                }
            }
            return Some(candidate.to_string());
        }
    }
    None
}

pub fn enrich_cue_speakers(
    cues: &mut [GeneratedSubtitleCue],
    glossary: Option<&FranchiseGlossary>,
) {
    for cue in cues.iter_mut() {
        if cue.speaker.as_ref().map(|s| !s.is_empty()).unwrap_or(false) {
            if let Some(g) = glossary {
                if let Some(s) = cue.speaker.as_ref() {
                    if let Some(resolved) = g.resolve_speaker(s) {
                        cue.speaker = Some(resolved);
                    }
                }
            }
            continue;
        }
        if let Some(style) = cue.style_name.as_ref() {
            if !style.is_empty() && !is_generic_style(style) {
                cue.speaker = glossary
                    .and_then(|g| g.resolve_speaker(style))
                    .or_else(|| Some(style.clone()));
                continue;
            }
        }
        if let Some(speaker) = detect_speaker_from_text(&cue.text, glossary) {
            cue.speaker = Some(speaker);
        }
    }
}

fn is_generic_style(style: &str) -> bool {
    matches!(
        style.to_ascii_lowercase().as_str(),
        "default" | "main" | "subtitle" | "dialogue" | "normal" | "bottom"
    )
}

pub fn collect_detected_speakers(cues: &[GeneratedSubtitleCue]) -> Vec<String> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for cue in cues {
        if let Some(s) = cue.speaker.as_ref() {
            if !s.is_empty() {
                *counts.entry(s.clone()).or_insert(0) += 1;
            }
        }
    }
    let mut speakers: Vec<(String, usize)> = counts.into_iter().collect();
    speakers.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    speakers.into_iter().map(|(s, _)| s).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_speaker_from_colon_prefix() {
        assert_eq!(
            detect_speaker_from_text("Sonic: Let's go!", None).as_deref(),
            Some("Sonic")
        );
    }
}
