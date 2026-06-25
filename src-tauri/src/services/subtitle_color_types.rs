use serde::{Deserialize, Serialize};

pub const DEFAULT_WHITE: &str = "#FFFFFF";
pub const DEFAULT_OUTLINE: &str = "#000000";
pub const SILVER_SUBTITLE: &str = "#E8E8E8";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ColorSource {
    UserOverride,
    ManualGlossary,
    FranchiseDefault,
    CharacterProfile,
    VisualAnalysis,
    NameSemantic,
    RoleHeuristic,
    SpeakerPalette,
    Fallback,
}

impl ColorSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::UserOverride => "user-override",
            Self::ManualGlossary => "manual-glossary",
            Self::FranchiseDefault => "franchise-default",
            Self::CharacterProfile => "character-profile",
            Self::VisualAnalysis => "visual-analysis",
            Self::NameSemantic => "name-semantic",
            Self::RoleHeuristic => "role-heuristic",
            Self::SpeakerPalette => "speaker-palette",
            Self::Fallback => "fallback",
        }
    }

    pub fn priority(&self) -> u8 {
        match self {
            Self::UserOverride => 0,
            Self::ManualGlossary => 1,
            Self::FranchiseDefault => 2,
            Self::CharacterProfile => 3,
            Self::VisualAnalysis => 4,
            Self::NameSemantic => 5,
            Self::RoleHeuristic => 6,
            Self::SpeakerPalette => 7,
            Self::Fallback => 8,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ColorConfidence {
    High,
    Medium,
    Low,
}

impl ColorConfidence {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSubtitleColor {
    pub color: String,
    pub outline_color: String,
    pub source: ColorSource,
    pub confidence: ColorConfidence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
}

impl CharacterSubtitleColor {
    pub fn fallback_white(reason: impl Into<String>) -> Self {
        Self {
            color: DEFAULT_WHITE.to_string(),
            outline_color: DEFAULT_OUTLINE.to_string(),
            source: ColorSource::Fallback,
            confidence: ColorConfidence::High,
            reason: Some(reason.into()),
            shadow: Some("1px 1px 2px rgba(0,0,0,0.85)".into()),
            texture: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadableSubtitleColor {
    pub color: String,
    pub outline_color: String,
    pub shadow: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<String>,
}
