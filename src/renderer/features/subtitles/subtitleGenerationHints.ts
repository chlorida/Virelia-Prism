import type { SubtitleTrack } from '../../../shared/subtitleTypes';

export type SubtitleGenerationMode = 'auto' | 'translate_existing' | 'from_audio';
export type SubtitleNameStyle = 'romanized' | 'localized_ru';

export interface SubtitleGenerationHints {
  hasExternalSubtitles: boolean;
  hasExternalInTargetLanguage: boolean;
  hasExternalForTranslation: boolean;
  canTranslateExisting: boolean;
  recommendTranslateExisting: boolean;
}

function isExternalLike(track: SubtitleTrack): boolean {
  return track.source === 'external' || track.source === 'embedded';
}

function languageMatches(trackLang: string, target: string): boolean {
  if (trackLang === target) return true;
  return trackLang.split('-')[0] === target.split('-')[0];
}

export function pickSourceSubtitleForTranslation(
  tracks: SubtitleTrack[],
  targetLanguage: string
): SubtitleTrack | null {
  const external = tracks.filter(isExternalLike);
  const candidates = external.filter(
    (t) => t.path && t.language !== 'und' && !languageMatches(t.language, targetLanguage)
  );
  if (candidates.length === 0) return null;
  const rank = (lang: string): number => {
    if (lang === 'ru') return 400;
    if (lang === 'ja') return 350;
    if (lang === 'en') return 300;
    return 200;
  };
  return [...candidates].sort((a, b) => rank(b.language) - rank(a.language))[0] ?? null;
}

export function getSubtitleGenerationHints(
  tracks: SubtitleTrack[],
  targetLanguage: string,
  translationAvailable: boolean
): SubtitleGenerationHints {
  const external = tracks.filter(isExternalLike);
  const hasExternalInTargetLanguage = external.some((t) => languageMatches(t.language, targetLanguage));
  const hasExternalForTranslation = external.some(
    (t) => t.language !== 'und' && !languageMatches(t.language, targetLanguage)
  );
  const canTranslateExisting = hasExternalInTargetLanguage
    || (hasExternalForTranslation && translationAvailable);
  return {
    hasExternalSubtitles: external.length > 0,
    hasExternalInTargetLanguage,
    hasExternalForTranslation,
    canTranslateExisting,
    recommendTranslateExisting: external.length > 0,
  };
}
