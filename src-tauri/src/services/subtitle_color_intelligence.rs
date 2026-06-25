use crate::services::subtitle_character_profile::{
    find_profile, profiles_for_franchise, CharacterProfile,
};
use crate::services::subtitle_color_readability::make_subtitle_color_readable;
use crate::services::subtitle_color_store::{
    character_map_key, load_franchise_color_map, load_review_color_map, save_franchise_color_map,
    save_review_color_map, StoredCharacterColor,
};
use crate::services::subtitle_color_types::{CharacterSubtitleColor, ColorConfidence, ColorSource};
use crate::services::subtitle_visual_color::{
    infer_character_color_from_visuals, VisualColorInferenceRequest,
};
use std::collections::HashMap;
use std::path::Path;

const REVIEW_PALETTE: &[&str] = &[
    "#00E5FF", "#FFEA00", "#FFA726", "#FF69B4", "#69F0AE", "#B388FF",
];

#[derive(Debug, Clone)]
pub struct CharacterColorContext<'a> {
    pub app_data: &'a Path,
    pub franchise_key: Option<&'a str>,
    pub video_key: &'a str,
    pub video_path: Option<&'a Path>,
    pub is_review_video: bool,
    pub allow_low_confidence_heuristic: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferCharacterColorRequest {
    pub franchise_key: Option<String>,
    pub video_key: String,
    pub video_path: Option<String>,
    pub character_name: Option<String>,
    pub speaker_id: Option<String>,
    #[serde(default)]
    pub context: InferColorSpeakerContext,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferColorSpeakerContext {
    #[serde(default)]
    pub cue_times: Vec<f64>,
    pub subtitle_style_name: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferCharacterColorResponse {
    pub color: String,
    pub outline_color: String,
    pub source: String,
    pub confidence: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_id: Option<String>,
}

impl From<CharacterSubtitleColor> for InferCharacterColorResponse {
    fn from(c: CharacterSubtitleColor) -> Self {
        Self {
            color: c.color.clone(),
            outline_color: c.outline_color.clone(),
            source: c.source.as_str().to_string(),
            confidence: c.confidence.as_str().to_string(),
            reason: c.reason.clone().unwrap_or_default(),
            shadow: c.shadow.clone(),
            texture: c.texture.clone(),
            character_id: None,
        }
    }
}

pub fn get_or_infer_character_color(
    ctx: &CharacterColorContext<'_>,
    character_name: &str,
    cue_times: &[f64],
) -> CharacterSubtitleColor {
    let name = character_name.trim();
    if name.is_empty() {
        return CharacterSubtitleColor::fallback_white("empty speaker name");
    }

    if ctx.is_review_video {
        return infer_review_speaker_color(ctx, name);
    }

    let franchise_key = ctx.franchise_key.unwrap_or("");
    let profiles = if franchise_key.is_empty() {
        vec![]
    } else {
        profiles_for_franchise(franchise_key)
    };
    let profile = find_profile(&profiles, name);
    let character_id = profile.map(|p| p.id.as_str()).unwrap_or(name);

    if let Some(franchise_key) = ctx.franchise_key {
        if let Some(stored) = load_cached_franchise_color(ctx.app_data, franchise_key, character_id)
        {
            if stored.source == ColorSource::UserOverride
                || stored.source.priority() <= ColorSource::FranchiseDefault.priority()
            {
                return stored;
            }
        }
    }

    if let Some(color) = infer_from_glossary_profile(profile) {
        maybe_persist_franchise_color(ctx, character_id, &color);
        return color;
    }

    if let Some(color) = infer_from_character_profile(profile) {
        maybe_persist_franchise_color(ctx, character_id, &color);
        return color;
    }

    if let (Some(franchise_key), Some(video_path)) = (ctx.franchise_key, ctx.video_path) {
        let visual_req = VisualColorInferenceRequest {
            franchise_key: Some(franchise_key.to_string()),
            character_name: name.to_string(),
            video_path: video_path.to_string_lossy().to_string(),
            cue_times: cue_times.to_vec(),
            screenshots: vec![],
        };
        if let Some(visual) = infer_character_color_from_visuals(&visual_req) {
            if visual.confidence != ColorConfidence::Low {
                maybe_persist_franchise_color(ctx, character_id, &visual);
                return visual;
            }
        }
    }

    if ctx.allow_low_confidence_heuristic {
        if let Some(heuristic) = infer_role_heuristic(profile, name) {
            return heuristic;
        }
    }

    CharacterSubtitleColor::fallback_white("no confident character color source")
}

fn load_cached_franchise_color(
    app_data: &Path,
    franchise_key: &str,
    character_id: &str,
) -> Option<CharacterSubtitleColor> {
    let map = load_franchise_color_map(app_data, franchise_key);
    let key = character_map_key(character_id);
    map.characters
        .get(&key)
        .cloned()
        .map(CharacterSubtitleColor::from)
}

fn maybe_persist_franchise_color(
    ctx: &CharacterColorContext<'_>,
    character_id: &str,
    color: &CharacterSubtitleColor,
) {
    let Some(franchise_key) = ctx.franchise_key else {
        return;
    };
    if color.source == ColorSource::Fallback || color.source == ColorSource::RoleHeuristic {
        return;
    }
    if color.confidence == ColorConfidence::Low {
        return;
    }
    let mut map = load_franchise_color_map(ctx.app_data, franchise_key);
    let key = character_map_key(character_id);
    if let Some(existing) = map.characters.get(&key) {
        if existing.source == ColorSource::UserOverride {
            return;
        }
        if existing.source.priority() < color.source.priority() {
            return;
        }
    }
    map.characters
        .insert(key, StoredCharacterColor::from(color));
    let _ = save_franchise_color_map(ctx.app_data, franchise_key, &map);
}

fn infer_from_glossary_profile(
    profile: Option<&CharacterProfile>,
) -> Option<CharacterSubtitleColor> {
    let profile = profile?;
    let raw = profile.glossary_color.as_ref()?;
    Some(make_subtitle_color_readable(
        raw,
        ColorSource::ManualGlossary,
        ColorConfidence::High,
        Some(format!(
            "Official franchise glossary color for {}",
            profile.canonical_name
        )),
        profile.texture.as_deref() == Some("silver"),
    ))
}

fn infer_from_character_profile(
    profile: Option<&CharacterProfile>,
) -> Option<CharacterSubtitleColor> {
    let profile = profile?;
    let raw = profile.pick_appearance_color()?;
    Some(make_subtitle_color_readable(
        raw,
        ColorSource::CharacterProfile,
        ColorConfidence::Medium,
        Some(format!(
            "Derived from appearance profile of {}",
            profile.canonical_name
        )),
        profile.texture.as_deref() == Some("silver"),
    ))
}

fn infer_role_heuristic(
    profile: Option<&CharacterProfile>,
    name: &str,
) -> Option<CharacterSubtitleColor> {
    let personality = profile.and_then(|p| p.personality.as_ref());
    let archetype = personality
        .and_then(|p| p.archetype.as_deref())
        .unwrap_or("");
    let traits: Vec<&str> = personality
        .map(|p| p.traits.iter().map(String::as_str).collect())
        .unwrap_or_default();

    let raw =
        if traits.iter().any(|t| matches!(*t, "aggressive" | "angry")) || archetype == "villain" {
            "#E53935"
        } else if traits.iter().any(|t| matches!(*t, "cute" | "romantic")) {
            "#FF69B4"
        } else if traits.iter().any(|t| matches!(*t, "energetic" | "happy")) {
            "#FFA726"
        } else if archetype == "protagonist" {
            "#90CAF9"
        } else if archetype == "mysterious" || archetype == "calm" {
            "#B39DDB"
        } else if name.to_lowercase().contains("shadow") {
            "#B71C1C"
        } else {
            return None;
        };

    Some(make_subtitle_color_readable(
        raw,
        ColorSource::RoleHeuristic,
        ColorConfidence::Low,
        Some("Role/personality heuristic — low confidence".into()),
        false,
    ))
}

fn infer_review_speaker_color(
    ctx: &CharacterColorContext<'_>,
    speaker_id: &str,
) -> CharacterSubtitleColor {
    let mut map = load_review_color_map(ctx.app_data, ctx.video_key);
    if let Some(existing) = map.speakers.get(speaker_id) {
        return CharacterSubtitleColor::from(existing.clone());
    }

    let speaker_count = map.speakers.len() + 1;
    if speaker_count <= 1 && map.main_speaker_id.is_none() {
        map.main_speaker_id = Some(speaker_id.to_string());
        let white = CharacterSubtitleColor::fallback_white("single review narrator");
        map.speakers
            .insert(speaker_id.to_string(), StoredCharacterColor::from(&white));
        let _ = save_review_color_map(ctx.app_data, &map);
        return white;
    }

    if map.main_speaker_id.is_none() {
        map.main_speaker_id = Some(speaker_id.to_string());
    }

    let is_main = map.main_speaker_id.as_deref() == Some(speaker_id);
    let color = if is_main {
        CharacterSubtitleColor::fallback_white("dominant review speaker")
    } else {
        let idx = map.speakers.len() % REVIEW_PALETTE.len();
        make_subtitle_color_readable(
            REVIEW_PALETTE[idx],
            ColorSource::SpeakerPalette,
            ColorConfidence::Medium,
            Some("Stable review speaker palette".into()),
            false,
        )
    };
    map.speakers
        .insert(speaker_id.to_string(), StoredCharacterColor::from(&color));
    let _ = save_review_color_map(ctx.app_data, &map);
    color
}

pub fn set_character_color_override(
    app_data: &Path,
    franchise_key: Option<&str>,
    video_key: Option<&str>,
    character_name: &str,
    color: &str,
    outline_color: &str,
) -> Result<CharacterSubtitleColor, String> {
    let profiles = franchise_key
        .map(profiles_for_franchise)
        .unwrap_or_default();
    let profile = find_profile(&profiles, character_name);
    let character_id = profile.map(|p| p.id.as_str()).unwrap_or(character_name);

    let entry = make_subtitle_color_readable(
        color,
        ColorSource::UserOverride,
        ColorConfidence::High,
        Some("User override".into()),
        false,
    );
    let mut final_color = entry;
    final_color.outline_color = outline_color.to_string();
    final_color.source = ColorSource::UserOverride;

    if let Some(franchise_key) = franchise_key {
        let mut map = load_franchise_color_map(app_data, franchise_key);
        map.characters.insert(
            character_map_key(character_id),
            StoredCharacterColor::from(&final_color),
        );
        save_franchise_color_map(app_data, franchise_key, &map)?;
    } else if let Some(video_key) = video_key {
        let mut map = load_review_color_map(app_data, video_key);
        map.speakers.insert(
            character_name.to_string(),
            StoredCharacterColor::from(&final_color),
        );
        save_review_color_map(app_data, &map)?;
    } else {
        return Err("franchiseKey or videoKey required for override".into());
    }

    Ok(final_color)
}

pub fn reset_character_color_override(
    app_data: &Path,
    franchise_key: Option<&str>,
    video_key: Option<&str>,
    character_name: &str,
) -> Result<(), String> {
    if let Some(franchise_key) = franchise_key {
        let profiles = profiles_for_franchise(franchise_key);
        let profile = find_profile(&profiles, character_name);
        let id = profile.map(|p| p.id.as_str()).unwrap_or(character_name);
        let mut map = load_franchise_color_map(app_data, franchise_key);
        map.characters.remove(&character_map_key(id));
        save_franchise_color_map(app_data, franchise_key, &map)?;
    } else if let Some(video_key) = video_key {
        let mut map = load_review_color_map(app_data, video_key);
        map.speakers.remove(character_name);
        save_review_color_map(app_data, &map)?;
    }
    Ok(())
}

pub fn assign_intelligent_subtitle_colors(
    cues: &mut [crate::services::subtitle_cue::GeneratedSubtitleCue],
    ctx: &CharacterColorContext<'_>,
    mode_off: bool,
) -> HashMap<String, CharacterSubtitleColor> {
    if mode_off {
        return HashMap::new();
    }

    let mut speaker_times: HashMap<String, Vec<f64>> = HashMap::new();
    for cue in cues.iter() {
        if let Some(speaker) = cue.speaker.as_ref() {
            if !speaker.is_empty() {
                speaker_times
                    .entry(speaker.clone())
                    .or_default()
                    .push(cue.start);
            }
        }
    }

    let mut assigned: HashMap<String, CharacterSubtitleColor> = HashMap::new();
    for (speaker, times) in speaker_times {
        let color = get_or_infer_character_color(ctx, &speaker, &times);
        assigned.insert(speaker.clone(), color.clone());
        for cue in cues.iter_mut() {
            if cue.speaker.as_deref() == Some(speaker.as_str()) {
                cue.color = Some(color.color.clone());
                cue.outline_color = Some(color.outline_color.clone());
            }
        }
    }
    assigned
}

pub fn infer_character_color_api(
    app_data: &Path,
    request: &InferCharacterColorRequest,
) -> InferCharacterColorResponse {
    let franchise_key = request.franchise_key.as_deref();
    let profiles = franchise_key
        .map(profiles_for_franchise)
        .unwrap_or_default();
    let name = request
        .character_name
        .as_deref()
        .or(request.speaker_id.as_deref())
        .unwrap_or("");
    let is_review = request
        .video_path
        .as_deref()
        .map(is_review_path)
        .unwrap_or(false);
    let ctx = CharacterColorContext {
        app_data,
        franchise_key,
        video_key: &request.video_key,
        video_path: request.video_path.as_deref().map(Path::new),
        is_review_video: is_review,
        allow_low_confidence_heuristic: true,
    };
    let mut result: InferCharacterColorResponse =
        get_or_infer_character_color(&ctx, name, &request.context.cue_times).into();
    if let Some(p) = find_profile(&profiles, name) {
        result.character_id = Some(p.id.clone());
    }
    result
}

fn is_review_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("review") || lower.contains("essay") || lower.contains("обзор")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::subtitle_color_types::DEFAULT_WHITE;
    use crate::services::subtitle_cue::GeneratedSubtitleCue;
    use tempfile::TempDir;

    fn ctx<'a>(
        tmp: &'a TempDir,
        franchise: Option<&'a str>,
        review: bool,
    ) -> CharacterColorContext<'a> {
        CharacterColorContext {
            app_data: tmp.path(),
            franchise_key: franchise,
            video_key: "vid-a",
            video_path: Some(Path::new("/Sonic/ep1.mkv")),
            is_review_video: review,
            allow_low_confidence_heuristic: true,
        }
    }

    #[test]
    fn manual_glossary_sonic_blue() {
        let tmp = TempDir::new().unwrap();
        let c = get_or_infer_character_color(&ctx(&tmp, Some("sonic"), false), "Sonic", &[]);
        assert_eq!(c.source, ColorSource::ManualGlossary);
        assert_eq!(c.confidence, ColorConfidence::High);
        assert_eq!(c.color, "#1E88FF");
    }

    #[test]
    fn tails_orange_amy_pink_silver() {
        let tmp = TempDir::new().unwrap();
        let ctx = ctx(&tmp, Some("sonic"), false);
        assert_eq!(
            get_or_infer_character_color(&ctx, "Tails", &[]).color,
            "#FFA726"
        );
        assert_eq!(
            get_or_infer_character_color(&ctx, "Amy", &[]).color,
            "#FF69B4"
        );
        let silver = get_or_infer_character_color(&ctx, "Silver", &[]);
        assert_eq!(silver.color, "#E8E8E8");
        assert_eq!(silver.outline_color, "#000000");
    }

    #[test]
    fn stable_franchise_color_across_videos() {
        let tmp = TempDir::new().unwrap();
        let ctx_a = CharacterColorContext {
            app_data: tmp.path(),
            franchise_key: Some("sonic"),
            video_key: "vid-a",
            video_path: Some(Path::new("/Sonic/a.mkv")),
            is_review_video: false,
            allow_low_confidence_heuristic: false,
        };
        let ctx_b = CharacterColorContext {
            video_key: "vid-b",
            ..ctx_a
        };
        let c1 = get_or_infer_character_color(&ctx_a, "Sonic", &[]);
        let c2 = get_or_infer_character_color(&ctx_b, "Sonic", &[]);
        assert_eq!(c1.color, c2.color);
        let map = load_franchise_color_map(tmp.path(), "sonic");
        assert!(map.characters.contains_key("sonic"));
    }

    #[test]
    fn different_franchise_separate_color_maps() {
        let tmp = TempDir::new().unwrap();
        get_or_infer_character_color(&ctx(&tmp, Some("sonic"), false), "Sonic", &[]);
        get_or_infer_character_color(
            &CharacterColorContext {
                app_data: tmp.path(),
                franchise_key: Some("higurashi"),
                video_key: "vid-h",
                video_path: Some(Path::new("/Higurashi/ep1.mkv")),
                is_review_video: false,
                allow_low_confidence_heuristic: false,
            },
            "Rena",
            &[],
        );
        let sonic_map = load_franchise_color_map(tmp.path(), "sonic");
        let higu_map = load_franchise_color_map(tmp.path(), "higurashi");
        assert!(sonic_map.characters.contains_key("sonic"));
        assert!(!higu_map.characters.contains_key("sonic"));
    }

    #[test]
    fn unknown_speaker_white() {
        let tmp = TempDir::new().unwrap();
        let mut cues = vec![cue("Hello", None)];
        let assigned =
            assign_intelligent_subtitle_colors(&mut cues, &ctx(&tmp, Some("sonic"), false), false);
        assert!(assigned.is_empty());
        assert!(cues[0].color.is_none());
    }

    #[test]
    fn review_single_speaker_white() {
        let tmp = TempDir::new().unwrap();
        let c = get_or_infer_character_color(&ctx(&tmp, None, true), "Host", &[]);
        assert_eq!(c.color, DEFAULT_WHITE);
    }

    #[test]
    fn review_multi_speaker_main_white_others_distinct() {
        let tmp = TempDir::new().unwrap();
        let ctx = ctx(&tmp, None, true);
        let main = get_or_infer_character_color(&ctx, "Host", &[]);
        let guest = get_or_infer_character_color(&ctx, "Guest", &[]);
        assert_eq!(main.color, DEFAULT_WHITE);
        assert_ne!(guest.color, DEFAULT_WHITE);
        assert_eq!(guest.source, ColorSource::SpeakerPalette);
    }

    #[test]
    fn user_override_beats_glossary() {
        let tmp = TempDir::new().unwrap();
        set_character_color_override(
            tmp.path(),
            Some("sonic"),
            None,
            "Sonic",
            "#FF0000",
            "#000000",
        )
        .unwrap();
        let c = get_or_infer_character_color(&ctx(&tmp, Some("sonic"), false), "Sonic", &[]);
        assert_eq!(c.source, ColorSource::UserOverride);
        assert_eq!(c.color, "#FF0000");
    }

    #[test]
    fn visual_low_confidence_does_not_override_glossary() {
        let tmp = TempDir::new().unwrap();
        let glossary = get_or_infer_character_color(&ctx(&tmp, Some("sonic"), false), "Tails", &[]);
        assert_eq!(glossary.source, ColorSource::ManualGlossary);
        let visual_req = VisualColorInferenceRequest {
            franchise_key: Some("sonic".into()),
            character_name: "Tails".into(),
            video_path: "/v.mp4".into(),
            cue_times: vec![1.0],
            screenshots: vec![],
        };
        assert!(infer_character_color_from_visuals(&visual_req).is_none());
    }

    fn cue(text: &str, speaker: Option<&str>) -> GeneratedSubtitleCue {
        GeneratedSubtitleCue {
            start: 0.0,
            end: 1.0,
            text: text.into(),
            speaker: speaker.map(str::to_string),
            ..Default::default()
        }
    }
}
