use crate::services::subtitle_color_types::{
    CharacterSubtitleColor, ColorConfidence, ColorSource, ReadableSubtitleColor, DEFAULT_OUTLINE,
    DEFAULT_WHITE, SILVER_SUBTITLE,
};

pub fn make_subtitle_color_readable(
    raw_color: &str,
    source: ColorSource,
    confidence: ColorConfidence,
    reason: Option<String>,
    prefer_silver_solid: bool,
) -> CharacterSubtitleColor {
    let readable = adapt_color_for_readability(raw_color, prefer_silver_solid);
    CharacterSubtitleColor {
        color: readable.color,
        outline_color: readable.outline_color,
        source,
        confidence,
        reason,
        shadow: Some(readable.shadow),
        texture: readable.texture,
    }
}

pub fn adapt_color_for_readability(raw: &str, prefer_silver_solid: bool) -> ReadableSubtitleColor {
    let normalized = normalize_hex(raw);
    let (r, g, b) = hex_to_rgb(&normalized).unwrap_or((255, 255, 255));
    let luminance = relative_luminance(r, g, b);

    let is_silver_like = normalized.eq_ignore_ascii_case("#F2F2F2")
        || normalized.eq_ignore_ascii_case("#C0C0C0")
        || normalized.eq_ignore_ascii_case("#E8E8E8")
        || normalized.eq_ignore_ascii_case("#FFFFFF");

    if is_silver_like || prefer_silver_solid {
        return ReadableSubtitleColor {
            color: SILVER_SUBTITLE.to_string(),
            outline_color: DEFAULT_OUTLINE.to_string(),
            shadow: "1px 1px 3px rgba(0,0,0,0.9)".into(),
            texture: if prefer_silver_solid {
                Some("silver".into())
            } else {
                None
            },
        };
    }

    let color = if luminance < 48.0 {
        lighten_rgb(r, g, b, 0.45)
    } else if luminance > 220.0 {
        darken_rgb(r, g, b, 0.12)
    } else {
        normalized
    };

    let outline = if relative_luminance_from_hex(&color) < 120.0 {
        "#FFFFFF".to_string()
    } else {
        DEFAULT_OUTLINE.to_string()
    };

    let shadow_strength = if relative_luminance_from_hex(&color) > 180.0 {
        "1px 1px 3px rgba(0,0,0,0.9)"
    } else {
        "1px 1px 2px rgba(0,0,0,0.75)"
    };

    ReadableSubtitleColor {
        color,
        outline_color: outline,
        shadow: shadow_strength.into(),
        texture: None,
    }
}

fn normalize_hex(raw: &str) -> String {
    let t = raw.trim();
    if t.starts_with('#') && t.len() == 7 {
        return t.to_uppercase();
    }
    DEFAULT_WHITE.to_string()
}

fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return None;
    }
    Some((
        u8::from_str_radix(&h[0..2], 16).ok()?,
        u8::from_str_radix(&h[2..4], 16).ok()?,
        u8::from_str_radix(&h[4..6], 16).ok()?,
    ))
}

fn rgb_to_hex(r: u8, g: u8, b: u8) -> String {
    format!("#{r:02X}{g:02X}{b:02X}")
}

fn relative_luminance(r: u8, g: u8, b: u8) -> f64 {
    0.299 * r as f64 + 0.587 * g as f64 + 0.114 * b as f64
}

fn relative_luminance_from_hex(hex: &str) -> f64 {
    hex_to_rgb(hex)
        .map(|(r, g, b)| relative_luminance(r, g, b))
        .unwrap_or(255.0)
}

fn lighten_rgb(r: u8, g: u8, b: u8, amount: f64) -> String {
    let lr = (r as f64 + (255.0 - r as f64) * amount).round() as u8;
    let lg = (g as f64 + (255.0 - g as f64) * amount).round() as u8;
    let lb = (b as f64 + (255.0 - b as f64) * amount).round() as u8;
    rgb_to_hex(lr, lg, lb)
}

fn darken_rgb(r: u8, g: u8, b: u8, amount: f64) -> String {
    let dr = (r as f64 * (1.0 - amount)).round() as u8;
    let dg = (g as f64 * (1.0 - amount)).round() as u8;
    let db = (b as f64 * (1.0 - amount)).round() as u8;
    rgb_to_hex(dr, dg, db)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dark_color_gets_readable_outline() {
        let c = adapt_color_for_readability("#1A1A1A", false);
        assert!(relative_luminance_from_hex(&c.color) > 80.0);
        assert_eq!(c.outline_color, DEFAULT_OUTLINE);
    }

    #[test]
    fn silver_gets_black_outline() {
        let c = adapt_color_for_readability("#F2F2F2", true);
        assert_eq!(c.color, SILVER_SUBTITLE);
        assert_eq!(c.outline_color, DEFAULT_OUTLINE);
    }
}
