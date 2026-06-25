export {
  buildSubtitleValidationStats,
  computeCoverageStats,
  filterDisplayCues,
  isNonSpeechCue,
  isSpeechCue,
  validateGeneratedCoverage,
  validateGeneratedSubtitles,
  validatePartialPlaybackCues,
  type GeneratedSubtitleValidation,
  type SubtitleValidationStats,
} from './subtitleCueUtils';

import { isSelectableGeneratedTrack } from './generatedSubtitleUsability';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';

export function isValidGeneratedTrack(track: SubtitleTrack | {
  source: string;
  generationValid?: boolean;
  isPartial?: boolean;
  recoveredFromFailure?: boolean;
  isLiveUpdating?: boolean;
  generationInvalidReason?: string;
  invalidReason?: string;
  generatedUntilSeconds?: number;
  path?: string;
}): boolean {
  if (track.source !== 'generated') return true;
  return isSelectableGeneratedTrack(track as SubtitleTrack);
}
