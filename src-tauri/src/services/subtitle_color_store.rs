use crate::services::subtitle_color_types::{CharacterSubtitleColor, ColorSource};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCharacterColor {
    pub color: String,
    pub outline_color: String,
    pub source: ColorSource,
    pub confidence: crate::services::subtitle_color_types::ColorConfidence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
}

impl From<&CharacterSubtitleColor> for StoredCharacterColor {
    fn from(c: &CharacterSubtitleColor) -> Self {
        Self {
            color: c.color.clone(),
            outline_color: c.outline_color.clone(),
            source: c.source,
            confidence: c.confidence,
            reason: c.reason.clone(),
            shadow: c.shadow.clone(),
            texture: c.texture.clone(),
        }
    }
}

impl From<StoredCharacterColor> for CharacterSubtitleColor {
    fn from(s: StoredCharacterColor) -> Self {
        Self {
            color: s.color,
            outline_color: s.outline_color,
            source: s.source,
            confidence: s.confidence,
            reason: s.reason,
            shadow: s.shadow,
            texture: s.texture,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FranchiseColorMap {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub franchise_key: Option<String>,
    pub characters: HashMap<String, StoredCharacterColor>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSpeakerColorMap {
    pub video_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_speaker_id: Option<String>,
    pub speakers: HashMap<String, StoredCharacterColor>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct LegacyStoredColorMap {
    speakers: HashMap<String, LegacyEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct LegacyEntry {
    color: String,
    outline_color: String,
    #[serde(default)]
    texture: Option<String>,
}

pub fn color_maps_dir(app_data: &Path) -> PathBuf {
    app_data.join("subtitles").join("color-maps")
}

pub fn franchise_color_map_path(app_data: &Path, franchise_key: &str) -> PathBuf {
    color_maps_dir(app_data).join(format!("franchise-{franchise_key}.json"))
}

pub fn review_color_map_path(app_data: &Path, video_key: &str) -> PathBuf {
    color_maps_dir(app_data).join(format!("video-{video_key}.json"))
}

pub fn load_franchise_color_map(app_data: &Path, franchise_key: &str) -> FranchiseColorMap {
    let path = franchise_color_map_path(app_data, franchise_key);
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(map) = serde_json::from_str::<FranchiseColorMap>(&raw) {
            return map;
        }
        if let Ok(legacy) = serde_json::from_str::<LegacyStoredColorMap>(&raw) {
            return migrate_legacy_franchise_map(franchise_key, legacy);
        }
    }
    FranchiseColorMap {
        franchise_key: Some(franchise_key.to_string()),
        characters: HashMap::new(),
    }
}

fn migrate_legacy_franchise_map(
    franchise_key: &str,
    legacy: LegacyStoredColorMap,
) -> FranchiseColorMap {
    let mut characters = HashMap::new();
    for (speaker, entry) in legacy.speakers {
        let id = speaker.to_lowercase().replace(' ', "-");
        characters.insert(
            id,
            StoredCharacterColor {
                color: entry.color,
                outline_color: entry.outline_color,
                source: ColorSource::FranchiseDefault,
                confidence: crate::services::subtitle_color_types::ColorConfidence::Medium,
                reason: Some("migrated from legacy color map".into()),
                shadow: None,
                texture: entry.texture,
            },
        );
    }
    FranchiseColorMap {
        franchise_key: Some(franchise_key.to_string()),
        characters,
    }
}

pub fn save_franchise_color_map(
    app_data: &Path,
    franchise_key: &str,
    map: &FranchiseColorMap,
) -> Result<(), String> {
    let path = franchise_color_map_path(app_data, franchise_key);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut to_save = map.clone();
    to_save.franchise_key = Some(franchise_key.to_string());
    let json = serde_json::to_string_pretty(&to_save).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn load_review_color_map(app_data: &Path, video_key: &str) -> ReviewSpeakerColorMap {
    let path = review_color_map_path(app_data, video_key);
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(map) = serde_json::from_str::<ReviewSpeakerColorMap>(&raw) {
            return map;
        }
        if let Ok(legacy) = serde_json::from_str::<LegacyStoredColorMap>(&raw) {
            let mut speakers = HashMap::new();
            for (id, entry) in legacy.speakers {
                speakers.insert(
                    id,
                    StoredCharacterColor {
                        color: entry.color,
                        outline_color: entry.outline_color,
                        source: ColorSource::SpeakerPalette,
                        confidence: crate::services::subtitle_color_types::ColorConfidence::Medium,
                        reason: Some("migrated review palette".into()),
                        shadow: None,
                        texture: entry.texture,
                    },
                );
            }
            return ReviewSpeakerColorMap {
                video_key: video_key.to_string(),
                main_speaker_id: None,
                speakers,
            };
        }
    }
    ReviewSpeakerColorMap {
        video_key: video_key.to_string(),
        main_speaker_id: None,
        speakers: HashMap::new(),
    }
}

pub fn save_review_color_map(app_data: &Path, map: &ReviewSpeakerColorMap) -> Result<(), String> {
    let path = review_color_map_path(app_data, &map.video_key);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn character_map_key(profile_id: &str) -> String {
    profile_id.to_lowercase()
}
