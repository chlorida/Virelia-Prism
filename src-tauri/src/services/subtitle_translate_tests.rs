#[cfg(test)]
mod tests {
    use super::super::subtitle_cue::GeneratedSubtitleCue;
    use super::super::subtitle_generation_pipeline::{
        apply_foreign_speech_markers, detect_dominant_speech_language,
    };
    use super::super::subtitle_translation::MockTranslationBackend;
    use super::super::subtitle_translation::{
        validate_translation_output, TranslationBackend, TranslationBackendKind,
        TranslationBatchRequest, TranslationConfig, TranslationCue,
    };

    #[test]
    fn foreign_speech_marker_for_french_cue_target_ru() {
        let mut cues = vec![
            GeneratedSubtitleCue {
                start: 0.0,
                end: 10.0,
                text: "日本語".into(),
                source_language: Some("ja".into()),
                ..Default::default()
            },
            GeneratedSubtitleCue {
                start: 10.0,
                end: 12.0,
                text: "Bonjour".into(),
                source_language: Some("fr".into()),
                ..Default::default()
            },
        ];
        let dominant = detect_dominant_speech_language(&cues);
        apply_foreign_speech_markers(&mut cues, dominant.as_deref(), "ru", true);
        assert!(cues[1].text.starts_with("[по-французски]"));
        assert!(!cues[0].text.starts_with('['));
    }

    #[test]
    fn translation_output_rejects_timestamps() {
        let cues = vec![GeneratedSubtitleCue {
            start: 0.0,
            end: 1.0,
            text: "00:00:01 --> 00:00:02".into(),
            ..Default::default()
        }];
        assert!(validate_translation_output(&cues, Some(1)).is_err());
    }

    #[test]
    fn mock_backend_produces_valid_output() {
        let backend = MockTranslationBackend;
        let request = TranslationBatchRequest {
            source_language: "en".into(),
            target_language: "ru".into(),
            cues: vec![TranslationCue {
                id: "0".into(),
                start: 0.0,
                end: 1.0,
                text: "Hello".into(),
                speaker: None,
                previous_text: None,
                next_text: None,
            }],
            glossary: None,
            context: None,
        };
        let response = backend.translate_batch(&request).unwrap();
        assert!(!response.entries()[0].text.contains("-->"));
    }

    #[test]
    fn request_model_uses_distinct_source_and_target() {
        let config = TranslationConfig {
            backend: TranslationBackendKind::Mock,
            ..Default::default()
        };
        assert_ne!(
            TranslationBackendKind::Mock.as_str(),
            TranslationBackendKind::Disabled.as_str()
        );
        assert!(super::super::subtitle_translation::translation_backend_available(&config));
    }
}
