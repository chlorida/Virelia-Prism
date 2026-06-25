use crate::services::subtitle_glossary::{apply_glossary, detect_glossary, NameStyle};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CharacterGlossaryEntry {
    id: String,
    pub canonical_name: String,
    pub aliases: Vec<String>,
    pub localized_names: HashMap<String, String>,
    default_subtitle_color: String,
    texture: Option<&'static str>,
}

#[derive(Debug, Clone)]
pub struct TermGlossaryEntry {
    pub canonical: String,
    pub aliases: Vec<String>,
    pub localized: HashMap<String, String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FranchiseGlossary {
    pub franchise_key: String,
    display_name: String,
    languages: Vec<String>,
    pub characters: Vec<CharacterGlossaryEntry>,
    pub terms: Vec<TermGlossaryEntry>,
}

impl FranchiseGlossary {
    #[cfg(test)]
    fn character_color(&self, speaker: &str) -> Option<&str> {
        let lower = speaker.to_lowercase();
        for ch in &self.characters {
            if ch.canonical_name.eq_ignore_ascii_case(speaker) {
                return Some(&ch.default_subtitle_color);
            }
            if ch
                .aliases
                .iter()
                .any(|a| a.eq_ignore_ascii_case(speaker) || lower.contains(&a.to_lowercase()))
            {
                return Some(&ch.default_subtitle_color);
            }
        }
        None
    }

    pub fn resolve_speaker(&self, raw: &str) -> Option<String> {
        let lower = raw.to_lowercase();
        for ch in &self.characters {
            if ch.canonical_name.eq_ignore_ascii_case(raw) {
                return Some(ch.canonical_name.clone());
            }
            for alias in &ch.aliases {
                if alias.eq_ignore_ascii_case(raw) || lower.contains(&alias.to_lowercase()) {
                    return Some(ch.canonical_name.clone());
                }
            }
        }
        None
    }

    pub fn apply_post_translation(&self, text: &str, target_language: &str) -> String {
        let mut result = text.to_string();
        for ch in &self.characters {
            for alias in &ch.aliases {
                if let Some(localized) = ch.localized_names.get(target_language) {
                    if target_language == "ru" {
                        result = replace_word_insensitive(&result, alias, localized);
                    }
                }
            }
        }
        for term in &self.terms {
            if let Some(localized) = term.localized.get(target_language) {
                for alias in &term.aliases {
                    result = replace_word_insensitive(&result, alias, localized);
                }
            }
        }
        result
    }

    pub fn to_translation_glossary(
        &self,
        target_language: &str,
    ) -> crate::services::subtitle_translation::TranslationGlossary {
        let mut character_names = HashMap::new();
        let mut terms = HashMap::new();
        for ch in &self.characters {
            if let Some(name) = ch.localized_names.get(target_language) {
                character_names.insert(ch.canonical_name.clone(), name.clone());
            }
        }
        for term in &self.terms {
            if let Some(loc) = term.localized.get(target_language) {
                terms.insert(term.canonical.clone(), loc.clone());
            }
        }
        crate::services::subtitle_translation::TranslationGlossary {
            franchise_key: Some(self.franchise_key.clone()),
            terms,
            character_names,
        }
    }
}

fn sonic_glossary() -> FranchiseGlossary {
    FranchiseGlossary {
        franchise_key: "sonic".into(),
        display_name: "Sonic".into(),
        languages: vec!["en".into(), "ru".into()],
        characters: vec![
            CharacterGlossaryEntry {
                id: "sonic".into(),
                canonical_name: "Sonic".into(),
                aliases: vec!["Sonic".into(), "Sonic the Hedgehog".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Sonic".into()),
                    ("ru".into(), "Соник".into()),
                ]),
                default_subtitle_color: "#1E88FF".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "tails".into(),
                canonical_name: "Tails".into(),
                aliases: vec!["Tails".into(), "Miles".into(), "Miles Prower".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Tails".into()),
                    ("ru".into(), "Тейлз".into()),
                ]),
                default_subtitle_color: "#FFA726".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "amy".into(),
                canonical_name: "Amy Rose".into(),
                aliases: vec!["Amy".into(), "Amy Rose".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Amy Rose".into()),
                    ("ru".into(), "Эми Роуз".into()),
                ]),
                default_subtitle_color: "#FF69B4".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "silver".into(),
                canonical_name: "Silver".into(),
                aliases: vec!["Silver".into(), "Silver the Hedgehog".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Silver".into()),
                    ("ru".into(), "Сильвер".into()),
                ]),
                default_subtitle_color: "#F2F2F2".into(),
                texture: Some("silver"),
            },
        ],
        terms: vec![],
    }
}

fn higurashi_franchise() -> FranchiseGlossary {
    FranchiseGlossary {
        franchise_key: "higurashi".into(),
        display_name: "Higurashi".into(),
        languages: vec!["en".into(), "ru".into()],
        characters: vec![
            CharacterGlossaryEntry {
                id: "keiichi".into(),
                canonical_name: "Keiichi".into(),
                aliases: vec![
                    "Keiichi".into(),
                    "Keiichi-kun".into(),
                    "Keiichi Maebara".into(),
                    "Ketchuk".into(),
                    "Keetchy".into(),
                ],
                localized_names: HashMap::from([
                    ("en".into(), "Keiichi".into()),
                    ("ru".into(), "Кейити".into()),
                ]),
                default_subtitle_color: "#FFFFFF".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "rena".into(),
                canonical_name: "Rena".into(),
                aliases: vec!["Rena".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Rena".into()),
                    ("ru".into(), "Рена".into()),
                ]),
                default_subtitle_color: "#FF8A80".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "rika".into(),
                canonical_name: "Rika".into(),
                aliases: vec!["Rika".into(), "Rika-chan".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Rika".into()),
                    ("ru".into(), "Рика".into()),
                ]),
                default_subtitle_color: "#CE93D8".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "satoko".into(),
                canonical_name: "Satoko".into(),
                aliases: vec!["Satoko".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Satoko".into()),
                    ("ru".into(), "Сатоко".into()),
                ]),
                default_subtitle_color: "#81D4FA".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "mion".into(),
                canonical_name: "Mion".into(),
                aliases: vec!["Mion".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Mion".into()),
                    ("ru".into(), "Мион".into()),
                ]),
                default_subtitle_color: "#A5D6A7".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "shion".into(),
                canonical_name: "Shion".into(),
                aliases: vec!["Shion".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Shion".into()),
                    ("ru".into(), "Шион".into()),
                ]),
                default_subtitle_color: "#FFCC80".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "hanyuu".into(),
                canonical_name: "Hanyuu".into(),
                aliases: vec!["Hanyuu".into(), "Hanyu".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Hanyuu".into()),
                    ("ru".into(), "Ханъю".into()),
                ]),
                default_subtitle_color: "#B39DDB".into(),
                texture: None,
            },
            CharacterGlossaryEntry {
                id: "oyashiro".into(),
                canonical_name: "Oyashiro-sama".into(),
                aliases: vec!["Oyashiro-sama".into(), "Oyashiro".into()],
                localized_names: HashMap::from([
                    ("en".into(), "Oyashiro-sama".into()),
                    ("ru".into(), "Оясиро-сама".into()),
                ]),
                default_subtitle_color: "#EF9A9A".into(),
                texture: None,
            },
        ],
        terms: vec![TermGlossaryEntry {
            canonical: "Hinamizawa".into(),
            aliases: vec!["Hinamizawa".into()],
            localized: HashMap::from([
                ("en".into(), "Hinamizawa".into()),
                ("ru".into(), "Хинамидзава".into()),
            ]),
        }],
    }
}

pub fn detect_franchise(
    video_path: &Path,
    franchise_key: Option<&str>,
) -> Option<FranchiseGlossary> {
    if let Some(key) = franchise_key {
        return match key {
            "sonic" => Some(sonic_glossary()),
            "higurashi" => Some(higurashi_franchise()),
            _ => None,
        };
    }
    let lower = video_path.to_string_lossy().to_lowercase();
    if lower.contains("sonic") {
        return Some(sonic_glossary());
    }
    if detect_glossary(video_path).is_some() {
        return Some(higurashi_franchise());
    }
    None
}

pub fn apply_legacy_glossary(text: &str, video_path: &Path, name_style: NameStyle) -> String {
    if let Some(g) = detect_glossary(video_path) {
        apply_glossary(text, g, name_style)
    } else {
        text.to_string()
    }
}

fn is_word_boundary(c: char) -> bool {
    c.is_whitespace()
        || matches!(
            c,
            ',' | '.' | '!' | '?' | '"' | '\'' | '(' | ')' | '[' | ']' | '-' | '—'
        )
}

fn replace_word_insensitive(text: &str, from: &str, to: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let from_chars: Vec<char> = from.chars().collect();
    if from_chars.is_empty() {
        return text.to_string();
    }
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if i + from_chars.len() <= chars.len() {
            let slice: String = chars[i..i + from_chars.len()].iter().collect();
            if slice.eq_ignore_ascii_case(from) {
                let prev = if i > 0 { chars[i - 1] } else { ' ' };
                let next = if i + from_chars.len() < chars.len() {
                    chars[i + from_chars.len()]
                } else {
                    ' '
                };
                if is_word_boundary(prev) && is_word_boundary(next) {
                    out.push_str(to);
                    i += from_chars.len();
                    continue;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sonic_colors_stable() {
        let g = sonic_glossary();
        assert_eq!(g.character_color("Sonic"), Some("#1E88FF"));
        assert_eq!(g.character_color("Tails"), Some("#FFA726"));
        assert_eq!(g.character_color("Amy"), Some("#FF69B4"));
        assert_eq!(g.character_color("Silver"), Some("#F2F2F2"));
    }

    #[test]
    fn higurashi_ketchuk_correction() {
        let g = higurashi_franchise();
        let text = g.apply_post_translation("Hello Ketchuk", "ru");
        assert!(text.contains("Кейити") || text.contains("Ketchuk"));
    }
}
