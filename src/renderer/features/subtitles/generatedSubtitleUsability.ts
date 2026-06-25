import type { SubtitleTrack } from '../../../shared/subtitleTypes';

export type GeneratedSubtitleUsability =
  | 'valid-final'
  | 'valid-partial'
  | 'recovered-partial'
  | 'invalid'
  | 'failed-no-cues'
  | 'failed-with-recovered-cues';

export function resolveGeneratedUsability(track: SubtitleTrack): GeneratedSubtitleUsability | null {
  if (track.source !== 'generated') return null;

  if (track.isPartial || track.isLiveUpdating) {
    if (track.recoveredFromFailure) return 'recovered-partial';
    return 'valid-partial';
  }

  if (track.recoveredFromFailure && track.generationValid === true) {
    return 'recovered-partial';
  }

  if (track.generationValid === true) {
    return 'valid-final';
  }

  if (track.generationValid === false) {
    const reason = track.generationInvalidReason ?? track.invalidReason;
    if (reason && track.generatedUntilSeconds && track.generatedUntilSeconds > 0) {
      return 'failed-with-recovered-cues';
    }
    return track.path ? 'invalid' : 'failed-no-cues';
  }

  return 'invalid';
}

export function isPartialPlaybackTrack(track: SubtitleTrack): boolean {
  if (track.source !== 'generated') return false;
  if (track.isPartial || track.isLiveUpdating) return true;
  if (track.recoveredFromFailure) return true;
  return false;
}

export function isSelectableGeneratedTrack(track: SubtitleTrack): boolean {
  const usability = resolveGeneratedUsability(track);
  return usability === 'valid-final'
    || usability === 'valid-partial'
    || usability === 'recovered-partial';
}

export function isInvalidGeneratedTrack(track: SubtitleTrack): boolean {
  if (track.source !== 'generated') return false;
  const usability = resolveGeneratedUsability(track);
  return usability === 'invalid'
    || usability === 'failed-no-cues'
    || usability === 'failed-with-recovered-cues';
}
