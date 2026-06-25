#[cfg(test)]
mod tests {
    use super::super::subtitle_ass_parser::{parse_ass_cues, subtitle_cues_to_generated};
    use super::super::subtitle_ass_writer::write_ass;
    use super::super::subtitle_colors::SpeakerColorMode;
    use super::super::subtitle_cue::{parse_subtitle_file_cues, GeneratedSubtitleCue};
    use super::super::subtitle_cue_quality::is_non_speech_cue;
    use super::super::subtitle_generation_pipeline::{
        finalize_generated_subtitles, FinalizeOptions, GenerationMethod,
    };
    use super::super::subtitle_glossary::NameStyle;
    use super::super::subtitle_translation::{
        translate_cues_in_batches, validate_translation_output, TranslationBackendKind,
        TranslationConfig,
    };
    use std::path::Path;

    const RUSSIAN_ASS: &str = r#"[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Rika,Arial,48,&H00FFFFFF&,&H000000FF&,&H00000000&,&H64000000&,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Rika,Rika,0,0,0,,Привет мир
Dialogue: 0,0:00:04.00,0:00:06.00,Rika,Rika,0,0,0,,Как дела?
"#;

    #[test]
    fn russian_ass_to_english_vtt_via_mock_backend() {
        let ass_cues = parse_ass_cues(RUSSIAN_ASS);
        let mut cues = subtitle_cues_to_generated(&ass_cues, Some("ru".into()));
        let config = TranslationConfig {
            backend: TranslationBackendKind::Mock,
            ..Default::default()
        };
        translate_cues_in_batches(
            &mut cues,
            "ru",
            "en",
            &config,
            None,
            NameStyle::Romanized,
            |_, _| {},
            None,
        )
        .expect("mock translation");

        let translation_config = config;
        let pipeline = finalize_generated_subtitles(
            cues,
            FinalizeOptions {
                video_path: Path::new("D:/anime/gou/ep02.mkv"),
                video_key: "vk-gou-ep02",
                target_language: "en",
                source_language_mode: "auto",
                detected_source_language: Some("ru".into()),
                mark_foreign_speech: true,
                show_sound_labels: false,
                name_style: NameStyle::Romanized,
                model: "translation",
                backend: "mock",
                generation_method: GenerationMethod::ExternalTranslate,
                source_subtitle_path: Some("D:/anime/gou/ep02.ru.ass".into()),
                run_cleanup: false,
                translation_config: &translation_config,
                app_data: None,
                franchise_key: None,
                speaker_color_mode: SpeakerColorMode::Auto,
                preserve_honorifics: true,
                video_type_review: false,
                output_format: "vtt",
                video_duration_sec: Some(10.0),
                translation_already_applied: true,
                translation_host: None,
            },
        )
        .expect("finalize translated cues");

        let parsed = parse_subtitle_file_cues(&pipeline.vtt, "vtt");
        assert!(parsed.len() > 0, "parsedCueCount must be > 0");
        assert!(parsed.iter().all(|c| !c.text.contains("-->")));
        assert!(pipeline.vtt.contains("[en]"));
    }

    #[test]
    fn ass_speaker_and_style_preserved_in_output() {
        let ass_cues = parse_ass_cues(RUSSIAN_ASS);
        let cues = subtitle_cues_to_generated(&ass_cues, Some("ru".into()));
        assert_eq!(cues[0].style_name.as_deref(), Some("Rika"));
        assert_eq!(cues[0].speaker.as_deref(), Some("Rika"));
        let body = write_ass(&cues, "Test");
        assert!(body.contains("Style: Rika,"));
        assert!(body.contains(",Rika,Rika,"));
    }

    #[test]
    fn translation_validation_rejects_timestamps_in_text() {
        let cues = vec![GeneratedSubtitleCue {
            start: 0.0,
            end: 1.0,
            text: "00:00:01 --> 00:00:02".into(),
            is_translated: true,
            ..Default::default()
        }];
        assert!(validate_translation_output(&cues, Some(1)).is_err());
    }

    #[test]
    fn mock_translation_preserves_non_speech_cues() {
        let mut cues = vec![
            GeneratedSubtitleCue {
                start: 0.0,
                end: 1.0,
                text: "(music)".into(),
                ..Default::default()
            },
            GeneratedSubtitleCue {
                start: 1.0,
                end: 2.0,
                text: "Hello".into(),
                ..Default::default()
            },
        ];
        let config = TranslationConfig {
            backend: TranslationBackendKind::Mock,
            ..Default::default()
        };
        translate_cues_in_batches(
            &mut cues,
            "en",
            "ru",
            &config,
            None,
            NameStyle::Romanized,
            |_, _| {},
            None,
        )
        .unwrap();
        assert!(is_non_speech_cue(&cues[0].text));
        assert!(cues[1].text.contains("[ru]"));
    }
}
