use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameStyle {
    Romanized,
    RussianLocalized,
}

impl NameStyle {
    pub fn from_str(raw: &str) -> Self {
        match raw.to_lowercase().as_str() {
            "localized_ru" | "russian" | "ru" => Self::RussianLocalized,
            _ => Self::Romanized,
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SubtitleGlossary {
    pub series_key: &'static str,
    display_name: &'static str,
    replacements: &'static [(&'static str, &'static str)],
    localized: &'static [(&'static str, &'static str)],
}

const HIGURASHI_REPLACEMENTS: &[(&str, &str)] = &[
    ("ketchuk", "Keiichi-kun"),
    ("keetchuk", "Keiichi-kun"),
    ("keetchy", "Keiichi"),
    ("ketchi", "Keiichi"),
    ("keetchi", "Keiichi"),
    ("keichi", "Keiichi"),
    ("ricker", "Rika"),
    ("rika-chan", "Rika-chan"),
    ("satoko", "Satoko"),
    ("mion", "Mion"),
    ("shion", "Shion"),
    ("hanyuu", "Hanyuu"),
    ("hanyu", "Hanyuu"),
    ("oyashiro", "Oyashiro"),
    ("hinamizawa", "Hinamizawa"),
    ("rena", "Rena"),
];

const HIGURASHI_LOCALIZED_RU: &[(&str, &str)] = &[
    ("Keiichi-kun", "Кейити-кун"),
    ("Keiichi", "Кейити"),
    ("Rika-chan", "Рика-тян"),
    ("Rika", "Рика"),
    ("Rena", "Рена"),
    ("Satoko", "Сатоко"),
    ("Mion", "Мион"),
    ("Shion", "Шион"),
    ("Hanyuu", "Ханъю"),
    ("Oyashiro-sama", "Оясиро-сама"),
    ("Oyashiro", "Оясиро"),
    ("Hinamizawa", "Хинамидзава"),
];

static HIGURASHI_GLOSSARY: SubtitleGlossary = SubtitleGlossary {
    series_key: "higurashi",
    display_name: "Higurashi",
    replacements: HIGURASHI_REPLACEMENTS,
    localized: HIGURASHI_LOCALIZED_RU,
};

pub fn detect_glossary(video_path: &Path) -> Option<&'static SubtitleGlossary> {
    let lower = video_path.to_string_lossy().to_lowercase();
    if lower.contains("higurashi")
        || lower.contains("higurashi no naku")
        || lower.contains("when they cry")
        || lower.contains("ひぐらし")
    {
        return Some(&HIGURASHI_GLOSSARY);
    }
    None
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

pub fn apply_glossary(text: &str, glossary: &SubtitleGlossary, name_style: NameStyle) -> String {
    let mut result = text.to_string();
    for (from, to) in glossary.replacements {
        result = replace_word_insensitive(&result, from, to);
    }
    if name_style == NameStyle::RussianLocalized {
        for (from, to) in glossary.localized {
            result = replace_word_insensitive(&result, from, to);
        }
    }
    result
}

pub fn count_suspicious_name_tokens(text: &str, glossary: &SubtitleGlossary) -> usize {
    let lower = text.to_lowercase();
    glossary
        .replacements
        .iter()
        .filter(|(from, _)| lower.contains(*from))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixes_ketchuk_hallucination() {
        let g = &HIGURASHI_GLOSSARY;
        assert_eq!(
            apply_glossary("I'm going home with Ketchuk!", g, NameStyle::Romanized),
            "I'm going home with Keiichi-kun!"
        );
    }

    #[test]
    fn localized_russian_names() {
        let g = &HIGURASHI_GLOSSARY;
        let text = apply_glossary("Hello Keiichi-kun", g, NameStyle::RussianLocalized);
        assert!(text.contains("Кейити-кун"));
    }

    #[test]
    fn detects_higurashi_from_path() {
        let path = Path::new("D:/Anime/Higurashi No Naku Koro Ni Gou EP01.mkv");
        assert_eq!(
            detect_glossary(path).map(|g| g.series_key),
            Some("higurashi")
        );
    }
}
