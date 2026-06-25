use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterAppearance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hair_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fur_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eye_color: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub outfit_colors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPersonality {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archetype: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub traits: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterProfile {
    pub id: String,
    pub franchise_key: String,
    pub canonical_name: String,
    pub aliases: Vec<String>,
    pub localized_names: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub appearance: Option<CharacterAppearance>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub personality: Option<CharacterPersonality>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glossary_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
}

impl CharacterProfile {
    pub fn resolve_id_or_name(&self, raw: &str) -> bool {
        if self.id.eq_ignore_ascii_case(raw) || self.canonical_name.eq_ignore_ascii_case(raw) {
            return true;
        }
        let lower = raw.to_lowercase();
        self.aliases
            .iter()
            .any(|a| a.eq_ignore_ascii_case(raw) || lower.contains(&a.to_lowercase()))
    }

    pub fn pick_appearance_color(&self) -> Option<&str> {
        let app = self.appearance.as_ref()?;
        app.theme_color
            .as_deref()
            .or(app.fur_color.as_deref())
            .or(app.hair_color.as_deref())
            .or(app.outfit_colors.first().map(String::as_str))
    }
}

pub fn profiles_for_franchise(franchise_key: &str) -> Vec<CharacterProfile> {
    match franchise_key {
        "sonic" => sonic_profiles(),
        "higurashi" => higurashi_profiles(),
        _ => vec![],
    }
}

pub fn find_profile<'a>(
    profiles: &'a [CharacterProfile],
    name: &str,
) -> Option<&'a CharacterProfile> {
    profiles.iter().find(|p| p.resolve_id_or_name(name))
}

fn sonic_profiles() -> Vec<CharacterProfile> {
    vec![
        profile(
            "sonic",
            "sonic",
            "Sonic",
            &["Sonic", "Sonic the Hedgehog"],
            Some(CharacterAppearance {
                hair_color: None,
                fur_color: Some("#1E88FF".into()),
                eye_color: Some("#00E676".into()),
                outfit_colors: vec!["#E53935".into()],
                theme_color: Some("#1E88FF".into()),
            }),
            None,
            Some("#1E88FF"),
            None,
        ),
        profile(
            "tails",
            "sonic",
            "Tails",
            &["Tails", "Miles", "Miles Prower"],
            Some(CharacterAppearance {
                hair_color: None,
                fur_color: Some("#FFA726".into()),
                eye_color: None,
                outfit_colors: vec!["#FFFFFF".into(), "#FF7043".into()],
                theme_color: Some("#FFA726".into()),
            }),
            None,
            Some("#FFA726"),
            None,
        ),
        profile(
            "amy",
            "sonic",
            "Amy Rose",
            &["Amy", "Amy Rose"],
            Some(CharacterAppearance {
                hair_color: None,
                fur_color: Some("#FF69B4".into()),
                eye_color: None,
                outfit_colors: vec!["#FF1744".into()],
                theme_color: Some("#FF69B4".into()),
            }),
            None,
            Some("#FF69B4"),
            None,
        ),
        profile(
            "silver",
            "sonic",
            "Silver",
            &["Silver", "Silver the Hedgehog"],
            Some(CharacterAppearance {
                hair_color: None,
                fur_color: Some("#E8E8E8".into()),
                eye_color: Some("#E040FB".into()),
                outfit_colors: vec![],
                theme_color: Some("#E8E8E8".into()),
            }),
            None,
            Some("#E8E8E8"),
            Some("silver"),
        ),
        profile(
            "knuckles",
            "sonic",
            "Knuckles",
            &["Knuckles", "Knuckles the Echidna"],
            Some(CharacterAppearance {
                fur_color: Some("#E53935".into()),
                hair_color: None,
                eye_color: None,
                outfit_colors: vec!["#4CAF50".into()],
                theme_color: Some("#E53935".into()),
            }),
            None,
            Some("#E53935"),
            None,
        ),
        profile(
            "shadow",
            "sonic",
            "Shadow",
            &["Shadow", "Shadow the Hedgehog"],
            Some(CharacterAppearance {
                fur_color: Some("#212121".into()),
                hair_color: None,
                eye_color: Some("#E53935".into()),
                outfit_colors: vec!["#E53935".into()],
                theme_color: Some("#B71C1C".into()),
            }),
            Some(CharacterPersonality {
                archetype: Some("rival".into()),
                traits: vec!["aggressive".into(), "mysterious".into()],
            }),
            Some("#B71C1C"),
            None,
        ),
    ]
}

fn higurashi_profiles() -> Vec<CharacterProfile> {
    vec![
        profile(
            "keiichi",
            "higurashi",
            "Keiichi",
            &["Keiichi", "Keiichi-kun", "Ketchuk"],
            None,
            Some(CharacterPersonality {
                archetype: Some("protagonist".into()),
                traits: vec![],
            }),
            None,
            None,
        ),
        profile(
            "rena",
            "higurashi",
            "Rena",
            &["Rena"],
            None,
            None,
            None,
            None,
        ),
        profile(
            "rika",
            "higurashi",
            "Rika",
            &["Rika", "Rika-chan"],
            None,
            None,
            None,
            None,
        ),
        profile(
            "satoko",
            "higurashi",
            "Satoko",
            &["Satoko"],
            None,
            None,
            None,
            None,
        ),
        profile(
            "mion",
            "higurashi",
            "Mion",
            &["Mion"],
            None,
            None,
            None,
            None,
        ),
        profile(
            "shion",
            "higurashi",
            "Shion",
            &["Shion"],
            None,
            None,
            None,
            None,
        ),
        profile(
            "hanyuu",
            "higurashi",
            "Hanyuu",
            &["Hanyuu", "Hanyu"],
            None,
            None,
            None,
            None,
        ),
        profile(
            "oyashiro",
            "higurashi",
            "Oyashiro-sama",
            &["Oyashiro-sama", "Oyashiro"],
            None,
            None,
            None,
            None,
        ),
    ]
}

fn profile(
    id: &str,
    franchise_key: &str,
    canonical: &str,
    aliases: &[&str],
    appearance: Option<CharacterAppearance>,
    personality: Option<CharacterPersonality>,
    glossary_color: Option<&str>,
    texture: Option<&str>,
) -> CharacterProfile {
    CharacterProfile {
        id: id.into(),
        franchise_key: franchise_key.into(),
        canonical_name: canonical.into(),
        aliases: aliases.iter().map(|s| s.to_string()).collect(),
        localized_names: HashMap::new(),
        appearance,
        personality,
        glossary_color: glossary_color.map(str::to_string),
        texture: texture.map(str::to_string),
    }
}
