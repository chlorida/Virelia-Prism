import type { TranslationKey } from '../../../shared/i18n';
import type { SubtitleApplyErrorKind } from './subtitleTextTrack';

export function humanizePlaybackSubtitleError(
  raw: string | undefined,
  errorKind: SubtitleApplyErrorKind | undefined,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): { message: string; details?: string } {
  if (!raw) {
    return { message: t('subtitles.parseFailed') };
  }
  if (
    errorKind === 'validation'
    || raw === 'generated_no_speech'
    || raw === 'generated_mostly_non_speech'
    || raw === 'generated_low_quality'
  ) {
    if (raw === 'generated_no_speech') {
      return { message: t('subtitles.generatedNoSpeech') };
    }
    if (raw === 'generated_mostly_non_speech') {
      return { message: t('subtitles.generatedMostlySoundLabels') };
    }
    if (raw === 'repeated_hallucinated_text') {
      return { message: t('subtitles.repeatedHallucinatedText') };
    }
    if (raw === 'hallucinated_sound_labels') {
      return { message: t('subtitles.hallucinatedSoundLabels') };
    }
    if (raw === 'generated_raw_vtt_in_cues') {
      return { message: t('subtitles.generatedRawVttInCues') };
    }
    if (raw === 'too-few-cues' || raw === 'asr_too_few_cues') {
      return { message: t('subtitles.asrTooFewCues') };
    }
    if (raw === 'low-coverage') {
      return { message: t('subtitles.lowCoverage') };
    }
    if (raw === 'output-too-small') {
      return { message: t('subtitles.outputTooSmall') };
    }
    return { message: t('subtitles.generatedInvalid'), details: raw };
  }
  if (errorKind === 'runtime') {
    return { message: t('subtitles.validationFailed'), details: raw };
  }
  if (errorKind === 'parse' || raw === 'parse_failed') {
    return { message: t('subtitles.parseFailed'), details: raw !== 'parse_failed' ? raw : undefined };
  }
  if (errorKind === 'stale') {
    return { message: t('subtitles.staleTrack'), details: raw };
  }
  return { message: t('subtitles.parseFailed'), details: raw };
}

export function humanizeSubtitleError(
  raw: string | undefined,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): { message: string; details?: string } {
  if (!raw) {
    return { message: t('subtitles.generationFailed') };
  }
  const lower = raw.toLowerCase();
  if (lower.includes('unavailable_no_ffmpeg')) {
    return { message: t('subtitles.generationUnavailable'), details: raw };
  }
  if (lower.includes('unavailable_no_backend')) {
    return { message: t('subtitles.generationNoBackend'), details: raw };
  }
  if (lower.includes('unavailable_no_model')) {
    const modelMatch = /ggml-([a-z0-9-]+)\.bin/i.exec(raw);
    const model = modelMatch?.[1] ?? 'medium';
    return { message: t('subtitles.generationModelMissing', { model }), details: raw };
  }
  if (lower.includes('whisper_model_init_failed') || lower.includes('failed to initialize whisper context')) {
    const modelMatch = /ggml-([a-z0-9-]+)\.bin/i.exec(raw);
    const model = modelMatch?.[1] ?? 'medium';
    return { message: t('subtitles.whisperModelLoadFailed', { model }), details: raw };
  }
  if (lower.includes('whisper_transcription_failed')) {
    return { message: t('subtitles.generationFailed'), details: raw };
  }
  if (lower.includes('unavailable_no_translation') || lower.includes('builtin_translation_not_installed')) {
    return { message: t('subtitles.translationNotConfigured'), details: raw };
  }
  if (lower.includes('wrong_target_language')) {
    return { message: t('subtitles.wrongTargetLanguage'), details: raw };
  }
  if (lower.includes('generated_no_speech')) {
    return { message: t('subtitles.generatedNoSpeech'), details: raw };
  }
  if (lower.includes('generated_mostly_non_speech')) {
    return { message: t('subtitles.generatedMostlySoundLabels'), details: raw };
  }
  if (lower.includes('repeated_hallucinated_text') || lower.includes('repeated hallucinated text')) {
    return { message: t('subtitles.repeatedHallucinatedText'), details: raw };
  }
  if (lower.includes('hallucinated_sound_labels')) {
    return { message: t('subtitles.hallucinatedSoundLabels'), details: raw };
  }
  if (lower.includes('generated_raw_vtt_in_cues')) {
    return { message: t('subtitles.generatedRawVttInCues'), details: raw };
  }
  if (lower.includes('generated_low_quality') || lower.includes('asr_quality_low')) {
    return { message: t('subtitles.asrQualityLow'), details: raw };
  }
  if (lower.includes('too-few-cues') || lower.includes('asr_too_few')) {
    return { message: t('subtitles.asrTooFewCues'), details: raw };
  }
  if (lower.includes('low-coverage')) {
    return { message: t('subtitles.lowCoverage'), details: raw };
  }
  if (lower.includes('output-too-small')) {
    return { message: t('subtitles.outputTooSmall'), details: raw };
  }
  if (lower.includes('no_external_subtitles')) {
    return { message: t('subtitles.noExternalSubtitles'), details: raw };
  }
  if (lower.includes('extracted_audio_silent') || lower.includes('extracted_audio_invalid')) {
    return { message: t('subtitles.extractedAudioSilent'), details: raw };
  }
  if (lower.includes('ffmpeg') || lower.includes('searched:')) {
    return {
      message: t('subtitles.generationUnavailable'),
      details: raw.includes('Searched') || lower.includes('searched:') ? raw : undefined,
    };
  }
  if (lower.includes('no audio track')) {
    return { message: t('subtitles.error.noAudioTrack') };
  }
  if (lower.includes('backend is not configured') || lower.includes('whisper') || lower.includes('ggml')) {
    return { message: raw };
  }
  if (lower.includes('cancelled')) {
    return { message: t('subtitles.cancel') };
  }
  return { message: t('subtitles.generationFailed'), details: raw };
}
