import type { TranslationKey } from '../../../shared/i18n';
import type { SubtitleTrack, SubtitleTrackStatus } from '../../../shared/subtitleTypes';
import { isValidGeneratedTrack } from './subtitleCueQuality';
import { humanizePlaybackSubtitleError } from './subtitleErrors';
import type { SubtitleApplyErrorKind } from './subtitleTextTrack';

export function resolveTrackStatus(track: SubtitleTrack): SubtitleTrackStatus {
  if (track.status) return track.status;
  if (track.source === 'generated' && !isValidGeneratedTrack(track)) return 'invalid';
  if (track.error) return 'failed';
  return 'valid';
}

export function resolveTrackInvalidReason(track: SubtitleTrack): string | undefined {
  return track.invalidReason ?? track.generationInvalidReason ?? track.error;
}

export function formatTrackInvalidMessage(
  track: SubtitleTrack,
  t: (key: TranslationKey) => string
): string {
  const reason = resolveTrackInvalidReason(track);
  if (!reason) return t('subtitles.generatedInvalid');
  return humanizePlaybackSubtitleError(reason, 'validation', t).message;
}

export function isGeneratedPlaybackError(
  errorKind: SubtitleApplyErrorKind | undefined,
  rawError?: string
): boolean {
  if (errorKind === 'validation') return true;
  if (!rawError) return false;
  return (
    rawError === 'generated_no_speech'
    || rawError === 'generated_mostly_non_speech'
    || rawError === 'generated_low_quality'
    || rawError === 'repeated_hallucinated_text'
    || rawError === 'generated_raw_vtt_in_cues'
    || rawError === 'too-few-cues'
    || rawError === 'low-coverage'
    || rawError === 'output-too-small'
    || rawError.startsWith('generated_')
  );
}

export function shouldShowGlobalPlaybackError(options: {
  playbackError?: string;
  playbackErrorKind?: SubtitleApplyErrorKind;
  playbackErrorTrackId?: string | null;
  selectedTrackId: string | null;
  selectedTrack?: SubtitleTrack | null;
}): boolean {
  const {
    playbackError,
    playbackErrorKind,
    playbackErrorTrackId,
    selectedTrackId,
    selectedTrack,
  } = options;
  if (!playbackError || !selectedTrackId || !selectedTrack) return false;
  if (playbackErrorTrackId && playbackErrorTrackId !== selectedTrackId) return false;
  if (
    selectedTrack.source !== 'generated'
    && isGeneratedPlaybackError(playbackErrorKind, playbackError)
  ) {
    return false;
  }
  return true;
}
