import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { isInvalidGeneratedTrack, isSelectableGeneratedTrack } from './generatedSubtitleUsability';
import { getSubtitleGenerationHints, pickSourceSubtitleForTranslation } from './subtitleGenerationHints';
import { partitionTracksBySource } from './subtitleScope';

function languageMatches(trackLang: string, target: string): boolean {
  if (trackLang === target) return true;
  return trackLang.split('-')[0] === target.split('-')[0];
}

export interface SubtitleMenuModel {
  availableTracks: SubtitleTrack[];
  invalidGenerated: SubtitleTrack[];
  validGeneratedInOutputLanguage: SubtitleTrack[];
  hasTrackInOutputLanguage: boolean;
  generationHints: ReturnType<typeof getSubtitleGenerationHints>;
  showTranslateButton: boolean;
  translateEnabled: boolean;
  showAudioGeneration: boolean;
  preferTranslateOverAudio: boolean;
  sourceTrackForTranslation: SubtitleTrack | null;
  displaySourceTrack: SubtitleTrack | null;
  hasAnySourceSubtitles: boolean;
}

export function buildSubtitleMenuModel(
  scopedTracks: SubtitleTrack[],
  outputLanguage: string,
  translationAvailable: boolean
): SubtitleMenuModel {
  const { embedded, external, generated } = partitionTracksBySource(scopedTracks);
  const validGenerated = generated.filter((tr) => isSelectableGeneratedTrack(tr));
  const invalidGenerated = generated.filter((tr) => isInvalidGeneratedTrack(tr));
  const availableTracks = [...external, ...embedded, ...validGenerated];
  const generationHints = getSubtitleGenerationHints(
    scopedTracks,
    outputLanguage,
    translationAvailable
  );
  const hasTrackInOutputLanguage = availableTracks.some((tr) =>
    languageMatches(tr.language, outputLanguage)
  );
  const validGeneratedInOutputLanguage = validGenerated.filter((tr) =>
    languageMatches(tr.language, outputLanguage)
  );
  const showTranslateButton =
    generationHints.hasExternalForTranslation
    && !generationHints.hasExternalInTargetLanguage;
  const translateEnabled = showTranslateButton && translationAvailable;
  const preferTranslateOverAudio = generationHints.hasExternalSubtitles;
  const sourceTrackForTranslation = pickSourceSubtitleForTranslation(scopedTracks, outputLanguage);
  const sourceLike = [...external, ...embedded];
  const displaySourceTrack = sourceTrackForTranslation
    ?? sourceLike.find((tr) => languageMatches(tr.language, outputLanguage))
    ?? sourceLike[0]
    ?? null;

  return {
    availableTracks,
    invalidGenerated,
    validGeneratedInOutputLanguage,
    hasTrackInOutputLanguage,
    generationHints,
    showTranslateButton,
    translateEnabled,
    showAudioGeneration: true,
    preferTranslateOverAudio,
    sourceTrackForTranslation,
    displaySourceTrack,
    hasAnySourceSubtitles: sourceLike.length > 0,
  };
}
