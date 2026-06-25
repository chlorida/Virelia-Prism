use crate::services::subtitle_color_readability::make_subtitle_color_readable;
use crate::services::subtitle_color_types::{CharacterSubtitleColor, ColorConfidence, ColorSource};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualColorInferenceRequest {
    pub franchise_key: Option<String>,
    pub character_name: String,
    pub video_path: String,
    #[serde(default)]
    pub cue_times: Vec<f64>,
    #[serde(default)]
    pub screenshots: Vec<String>,
}

/// Non-blocking visual color inference stub.
/// Real implementation would sample frames around `cue_times` and extract dominant character colors.
pub fn infer_character_color_from_visuals(
    request: &VisualColorInferenceRequest,
) -> Option<CharacterSubtitleColor> {
    if request.screenshots.is_empty() && request.cue_times.is_empty() {
        return None;
    }

    if let Some(path) = request.screenshots.first() {
        return infer_from_image_path(path, &request.character_name);
    }

    // Placeholder: when cue times exist but frame extraction is not wired yet.
    let _ = (&request.video_path, &request.franchise_key);
    None
}

fn infer_from_image_path(image_path: &str, character_name: &str) -> Option<CharacterSubtitleColor> {
    let lower = image_path.to_lowercase();
    if !lower.ends_with(".png")
        && !lower.ends_with(".jpg")
        && !lower.ends_with(".jpeg")
        && !lower.ends_with(".webp")
    {
        return None;
    }
    let bytes = std::fs::read(image_path).ok()?;
    let dominant = dominant_saturated_color(&bytes)?;
    if dominant.confidence < 0.35 {
        return None;
    }
    Some(make_subtitle_color_readable(
        &dominant.hex,
        ColorSource::VisualAnalysis,
        ColorConfidence::Medium,
        Some(format!(
            "Dominant color from reference image for {character_name}"
        )),
        false,
    ))
}

struct DominantSample {
    hex: String,
    confidence: f32,
}

/// Very small RGB histogram — enough for tests and future frame pipeline hook.
fn dominant_saturated_color(bytes: &[u8]) -> Option<DominantSample> {
    if bytes.len() < 12 {
        return None;
    }
    let mut buckets: [u32; 6] = [0; 6];
    for chunk in bytes.chunks(3) {
        if chunk.len() < 3 {
            break;
        }
        let r = chunk[0];
        let g = chunk[1];
        let b = chunk[2];
        let max = r.max(g).max(b) as i32;
        let min = r.min(g).min(b) as i32;
        if max - min < 24 {
            continue;
        }
        let idx = if r > g && r > b {
            0
        } else if g > r && g > b {
            1
        } else if b > r && b > g {
            2
        } else if r > 200 && g > 120 {
            3
        } else if r > 180 && b > 180 {
            4
        } else {
            5
        };
        buckets[idx] += 1;
    }
    let total: u32 = buckets.iter().sum();
    if total == 0 {
        return None;
    }
    let (idx, count) = buckets
        .iter()
        .enumerate()
        .max_by_key(|(_, c)| *c)
        .map(|(i, c)| (i, *c))?;
    let hex = match idx {
        0 => "#E53935",
        1 => "#43A047",
        2 => "#1E88FF",
        3 => "#FFA726",
        4 => "#FF69B4",
        _ => "#9E9E9E",
    };
    Some(DominantSample {
        hex: hex.into(),
        confidence: count as f32 / total as f32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_confidence_without_inputs() {
        let req = VisualColorInferenceRequest {
            franchise_key: Some("sonic".into()),
            character_name: "Knuckles".into(),
            video_path: "/v.mp4".into(),
            cue_times: vec![],
            screenshots: vec![],
        };
        assert!(infer_character_color_from_visuals(&req).is_none());
    }
}
