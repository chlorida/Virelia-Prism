use crate::services::subtitle_color_intelligence::{
    assign_intelligent_subtitle_colors, CharacterColorContext,
};
use crate::services::subtitle_color_types::CharacterSubtitleColor;
use crate::services::subtitle_color_types::DEFAULT_WHITE;
use crate::services::subtitle_cue::GeneratedSubtitleCue;
use crate::services::subtitle_franchise::FranchiseGlossary;
use crate::services::subtitle_speaker::collect_detected_speakers;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SpeakerColorMode {
    Auto,
    Franchise,
    SingleColor,
    Off,
}

impl SpeakerColorMode {
    pub fn from_str(raw: &str) -> Self {
        match raw.to_lowercase().as_str() {
            "franchise" => Self::Franchise,
            "singlecolor" | "single_color" | "single" => Self::SingleColor,
            "off" => Self::Off,
            _ => Self::Auto,
        }
    }
}

/// Legacy entry shape for metadata sidecars.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorMapEntry {
    pub color: String,
    pub outline_color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
}

impl From<&CharacterSubtitleColor> for ColorMapEntry {
    fn from(c: &CharacterSubtitleColor) -> Self {
        Self {
            color: c.color.clone(),
            outline_color: c.outline_color.clone(),
            source: Some(c.source.as_str().to_string()),
            confidence: Some(c.confidence.as_str().to_string()),
            texture: c.texture.clone(),
        }
    }
}

pub struct ColorAssignmentContext<'a> {
    pub franchise: Option<&'a FranchiseGlossary>,
    pub franchise_key: Option<&'a str>,
    pub video_key: &'a str,
    pub video_path: Option<&'a Path>,
    pub app_data: &'a Path,
    pub mode: SpeakerColorMode,
    pub video_type_review: bool,
}

pub fn assign_subtitle_colors(
    cues: &mut [GeneratedSubtitleCue],
    ctx: &ColorAssignmentContext<'_>,
) -> HashMap<String, ColorMapEntry> {
    if ctx.mode == SpeakerColorMode::Off {
        return HashMap::new();
    }

    if ctx.mode == SpeakerColorMode::SingleColor {
        let speakers = collect_detected_speakers(cues);
        let entry = ColorMapEntry {
            color: DEFAULT_WHITE.to_string(),
            outline_color: "#000000".into(),
            source: Some("fallback".into()),
            confidence: Some("high".into()),
            texture: None,
        };
        for cue in cues.iter_mut() {
            if cue.speaker.is_some() {
                cue.color = Some(entry.color.clone());
                cue.outline_color = Some(entry.outline_color.clone());
            }
        }
        return speakers.into_iter().map(|s| (s, entry.clone())).collect();
    }

    let franchise_key = ctx
        .franchise_key
        .or_else(|| ctx.franchise.map(|f| f.franchise_key.as_str()));

    let use_franchise_intelligence =
        ctx.mode == SpeakerColorMode::Franchise || franchise_key.is_some() || ctx.video_type_review;

    if !use_franchise_intelligence {
        return HashMap::new();
    }

    if ctx.video_type_review {
        let speakers = collect_detected_speakers(cues);
        if speakers.len() <= 1 {
            let entry = ColorMapEntry {
                color: DEFAULT_WHITE.to_string(),
                outline_color: "#000000".into(),
                source: Some("fallback".into()),
                confidence: Some("high".into()),
                texture: None,
            };
            for cue in cues.iter_mut() {
                if cue.speaker.is_some() {
                    cue.color = Some(entry.color.clone());
                    cue.outline_color = Some(entry.outline_color.clone());
                }
            }
            return speakers.into_iter().map(|s| (s, entry.clone())).collect();
        }
    }

    let color_ctx = CharacterColorContext {
        app_data: ctx.app_data,
        franchise_key: if ctx.video_type_review {
            None
        } else {
            franchise_key
        },
        video_key: ctx.video_key,
        video_path: ctx.video_path,
        is_review_video: ctx.video_type_review,
        allow_low_confidence_heuristic: ctx.mode != SpeakerColorMode::Franchise,
    };

    if color_ctx.is_review_video && collect_detected_speakers(cues).len() > 1 {
        prime_review_main_speaker(ctx.app_data, ctx.video_key, cues);
    }

    assign_intelligent_subtitle_colors(cues, &color_ctx, false)
        .into_iter()
        .map(|(k, v)| (k, ColorMapEntry::from(&v)))
        .collect()
}

fn prime_review_main_speaker(app_data: &Path, video_key: &str, cues: &[GeneratedSubtitleCue]) {
    use crate::services::subtitle_color_store::{load_review_color_map, save_review_color_map};
    let speakers = collect_detected_speakers(cues);
    if speakers.is_empty() {
        return;
    }
    let mut map = load_review_color_map(app_data, video_key);
    if map.main_speaker_id.is_none() {
        map.main_speaker_id = Some(speakers[0].clone());
        let _ = save_review_color_map(app_data, &map);
    }
}
