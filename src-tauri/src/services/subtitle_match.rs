use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub fn extract_episode_tokens(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let mut tokens = Vec::new();

    for cap in regex_lite_find_bracket_episodes(&lower) {
        tokens.push(cap);
    }
    for cap in regex_lite_find_ep_patterns(&lower) {
        tokens.push(cap);
    }

    tokens.sort();
    tokens.dedup();
    tokens
}

fn regex_lite_find_bracket_episodes(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'[' {
            let start = i + 1;
            let mut j = start;
            while j < bytes.len() && bytes[j] != b']' {
                j += 1;
            }
            if j < bytes.len() {
                let inner = &text[start..j];
                if let Ok(n) = inner.parse::<u32>() {
                    out.push(format!("{:02}", n));
                    out.push(n.to_string());
                } else if inner.len() == 2 && inner.chars().all(|c| c.is_ascii_digit()) {
                    out.push(inner.to_string());
                }
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    out
}

fn regex_lite_find_ep_patterns(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let patterns = ["ep", "e", "episode "];
    let lower = text.to_lowercase();
    for pat in patterns {
        let mut search_from = 0;
        while let Some(idx) = lower[search_from..].find(pat) {
            let pos = search_from + idx + pat.len();
            let rest: String = lower[pos..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if !rest.is_empty() {
                if let Ok(n) = rest.parse::<u32>() {
                    out.push(format!("{:02}", n));
                    out.push(n.to_string());
                }
            }
            search_from = pos + rest.len().max(1);
        }
    }
    out
}

pub fn episode_overlap(video_tokens: &[String], sub_tokens: &[String]) -> bool {
    if video_tokens.is_empty() || sub_tokens.is_empty() {
        return false;
    }
    video_tokens
        .iter()
        .any(|v| sub_tokens.iter().any(|s| v == s))
}

pub fn normalize_for_match(text: &str) -> String {
    text.to_lowercase()
        .replace(['_', '-', '.', '[', ']', '(', ')'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn fuzzy_stem_match(video_stem: &str, sub_stem: &str) -> u32 {
    if video_stem == sub_stem {
        return 100;
    }
    if sub_stem.starts_with(video_stem) || video_stem.starts_with(sub_stem) {
        return 80;
    }
    let v_norm = normalize_for_match(video_stem);
    let s_norm = normalize_for_match(sub_stem);
    if v_norm == s_norm {
        return 90;
    }
    if s_norm.contains(&v_norm) || v_norm.contains(&s_norm) {
        return 60;
    }
    let v_tokens = extract_episode_tokens(video_stem);
    let s_tokens = extract_episode_tokens(sub_stem);
    if episode_overlap(&v_tokens, &s_tokens) && series_identity_compatible(video_stem, sub_stem) {
        return 70;
    }
    0
}

fn series_identity_tokens(stem: &str) -> HashSet<String> {
    let lower = normalize_for_match(stem);
    let markers = [
        "gou",
        "sotsu",
        "kai",
        "rei",
        "higurashi",
        "when they cry",
        "naku",
        "koro",
    ];
    markers
        .iter()
        .filter(|marker| lower.contains(*marker))
        .map(|marker| marker.to_string())
        .collect()
}

/// Reject cross-season matches that only share episode number (e.g. Gou EP01 vs Sotsu EP01).
pub fn series_identity_compatible(video_stem: &str, sub_stem: &str) -> bool {
    let v_series = series_identity_tokens(video_stem);
    let s_series = series_identity_tokens(sub_stem);
    let season_markers = ["gou", "sotsu", "kai", "rei"];
    let v_season: HashSet<_> = v_series
        .iter()
        .filter(|t| season_markers.contains(&t.as_str()))
        .cloned()
        .collect();
    let s_season: HashSet<_> = s_series
        .iter()
        .filter(|t| season_markers.contains(&t.as_str()))
        .cloned()
        .collect();
    if !v_season.is_empty() || !s_season.is_empty() {
        return v_season == s_season;
    }
    let shared: HashSet<_> = v_series.intersection(&s_series).cloned().collect();
    shared.len() >= 2
}

/// Subtitle file must live in the current video directory or an allowed subtitle subfolder (max 2 levels).
pub fn is_subtitle_candidate_near_video(candidate_path: &Path, video_path: &Path) -> bool {
    let Some(video_dir) = video_path.parent() else {
        return false;
    };
    let video_dir = canonicalize_lossy(video_dir);
    let Some(candidate_parent) = candidate_path.parent() else {
        return false;
    };
    let candidate_dir = canonicalize_lossy(candidate_parent);
    if !candidate_dir.starts_with(&video_dir) {
        return false;
    }
    relative_depth(&video_dir, &candidate_dir) <= 2
}

fn canonicalize_lossy(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn relative_depth(base: &Path, child: &Path) -> usize {
    let base_parts: Vec<_> = base.components().collect();
    let child_parts: Vec<_> = child.components().collect();
    if child_parts.len() < base_parts.len() {
        return usize::MAX;
    }
    if child_parts[..base_parts.len()] != base_parts[..] {
        return usize::MAX;
    }
    child_parts.len() - base_parts.len()
}

pub fn is_subtitle_folder_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    let markers = [
        "sub",
        "subs",
        "subtitle",
        "subtitles",
        "суб",
        "саб",
        "сабы",
        "rus",
        "eng",
        "russian",
        "english",
        "japanese",
        "german",
        "french",
        "spanish",
    ];
    markers.iter().any(|m| lower.contains(m))
}

pub fn collect_subtitle_search_roots(video_path: &Path) -> Vec<std::path::PathBuf> {
    use std::fs;
    let mut roots = Vec::new();
    let Some(video_dir) = video_path.parent() else {
        return roots;
    };
    roots.push(video_dir.to_path_buf());

    if let Ok(entries) = fs::read_dir(video_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !is_subtitle_folder_name(&name) {
                continue;
            }
            roots.push(path.clone());
            if let Ok(sub) = fs::read_dir(&path) {
                for sub_entry in sub.flatten() {
                    let sub_path = sub_entry.path();
                    if sub_path.is_dir()
                        && is_subtitle_folder_name(&sub_entry.file_name().to_string_lossy())
                    {
                        roots.push(sub_path);
                    }
                }
            }
        }
    }
    if let Some(parent) = video_dir.parent() {
        if parent != video_dir {
            roots.push(parent.to_path_buf());
            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    let name = entry.file_name().to_string_lossy().to_string();
                    if is_subtitle_folder_name(&name) {
                        roots.push(path);
                    }
                }
            }
        }
    }

    roots.sort();
    roots.dedup();
    roots
}

/// Season-level subtitle folders with episode/series identity match (not only under video dir).
pub fn is_extended_subtitle_candidate(candidate_path: &Path, video_path: &Path) -> bool {
    let video_stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let sub_stem = candidate_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if fuzzy_stem_match(video_stem, sub_stem) < 70 {
        return false;
    }
    if !series_identity_compatible(video_stem, sub_stem) {
        return false;
    }
    let Some(parent) = candidate_path.parent() else {
        return false;
    };
    let folder_name = parent
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if !is_subtitle_folder_name(&folder_name) {
        return false;
    }
    let video_dir = match video_path.parent() {
        Some(d) => canonicalize_lossy(d),
        None => return false,
    };
    let candidate_dir = canonicalize_lossy(parent);
    if candidate_dir.starts_with(&video_dir) {
        return true;
    }
    if let Some(grandparent) = video_path.parent().and_then(|p| p.parent()) {
        let gp = canonicalize_lossy(grandparent);
        if candidate_dir.starts_with(&gp) && relative_depth(&gp, &candidate_dir) <= 3 {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_bracket_episode() {
        let tokens = extract_episode_tokens("[VCB-Studio] Higurashi Sotsu [01][1080p]");
        assert!(tokens.contains(&"01".to_string()));
    }

    #[test]
    fn rus_subs_folder_matches() {
        assert!(is_subtitle_folder_name("Rus subs"));
    }

    #[test]
    fn fuzzy_matches_episode_in_long_anime_name() {
        let video = "[VCB-Studio] Higurashi no Naku Koro ni Sotsu [01][Ma10p_1080p]";
        let sub = "[VCB-Studio] Higurashi no Naku Koro ni Sotsu [01][Russian]";
        assert!(fuzzy_stem_match(video, sub) >= 60);
    }

    #[test]
    fn gou_and_sotsu_ep01_do_not_match_by_episode_only() {
        let gou = "Higurashi No Naku Koro Ni Gou (2020) [BDRip 720p] - 01";
        let sotsu_sub = "[VCB-Studio] Higurashi no Naku Koro ni Sotsu [01][Ma10p_1080p]";
        assert_eq!(fuzzy_stem_match(gou, sotsu_sub), 0);
    }

    #[test]
    fn subtitle_in_other_season_folder_is_not_near_video() {
        let dir = std::env::temp_dir();
        let gou_dir = dir.join("gou-show");
        let sotsu_dir = dir.join("sotsu-show");
        let _ = fs::create_dir_all(&gou_dir);
        let _ = fs::create_dir_all(&sotsu_dir);
        let gou_video = gou_dir.join("ep01.mkv");
        let sotsu_sub = sotsu_dir.join("Rus subs").join("ep01.ass");
        let _ = fs::create_dir_all(sotsu_sub.parent().unwrap());
        assert!(!is_subtitle_candidate_near_video(&sotsu_sub, &gou_video));
    }
}
