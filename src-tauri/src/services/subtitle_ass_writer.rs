use crate::services::subtitle_cue::GeneratedSubtitleCue;
use std::collections::HashMap;

pub fn write_ass(cues: &[GeneratedSubtitleCue], title: &str) -> String {
    let mut styles: HashMap<String, String> = HashMap::new();
    styles.insert("Default".into(), default_style_line("Default", "#FFFFFF"));
    for cue in cues {
        let style_name = cue
            .speaker
            .clone()
            .or_else(|| cue.style_name.clone())
            .unwrap_or_else(|| "Default".into());
        if !styles.contains_key(&style_name) {
            let color = cue.color.as_deref().unwrap_or("#FFFFFF");
            styles.insert(style_name.clone(), default_style_line(&style_name, color));
        }
    }

    let mut out = String::from("[Script Info]\n");
    out.push_str("Title: ");
    out.push_str(title);
    out.push_str("\nScriptType: v4.00+\nCollisions: Normal\nPlayResX: 1920\nPlayResY: 1080\n\n");
    out.push_str("[V4+ Styles]\n");
    out.push_str("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n");
    for style in styles.values() {
        out.push_str(style);
        out.push('\n');
    }
    out.push_str("\n[Events]\n");
    out.push_str(
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
    );
    for cue in cues {
        let style_name = cue
            .speaker
            .clone()
            .or_else(|| cue.style_name.clone())
            .unwrap_or_else(|| "Default".into());
        let speaker = cue.speaker.clone().unwrap_or_default();
        let layer = cue.layer.unwrap_or(0);
        let ml = cue.margin_l.unwrap_or(0);
        let mr = cue.margin_r.unwrap_or(0);
        let mv = cue.margin_v.unwrap_or(0);
        let effect = cue.effect.clone().unwrap_or_default();
        let text = cue.text.replace('\n', "\\N");
        out.push_str(&format!(
            "Dialogue: {layer},{},{},{style_name},{speaker},{ml},{mr},{mv},{effect},{text}\n",
            format_ass_time(cue.start),
            format_ass_time(cue.end),
        ));
    }
    out
}

fn default_style_line(name: &str, hex_color: &str) -> String {
    let primary = hex_to_ass_color(hex_color);
    let outline = "&H000000&";
    format!(
        "Style: {name},Arial,48,{primary},&H000000&,{outline},&H64000000&,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1"
    )
}

fn hex_to_ass_color(hex: &str) -> String {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return "&H00FFFFFF&".to_string();
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(255);
    format!("&H00{b:02X}{g:02X}{r:02X}&")
}

fn format_ass_time(seconds: f64) -> String {
    let h = (seconds / 3600.0).floor() as u32;
    let m = ((seconds % 3600.0) / 60.0).floor() as u32;
    let s = seconds % 60.0;
    let cs = (s.fract() * 100.0).round() as u32;
    let s_int = s.floor() as u32;
    format!("{h}:{m:02}:{s_int:02}.{cs:02}")
}
