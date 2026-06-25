import { describe, expect, it } from 'vitest';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { getSubtitleGenerationHints } from './subtitleGenerationHints';

function externalTrack(language: string): SubtitleTrack {
  return {
    id: `ext-${language}`,
    videoId: 'v1',
    videoPath: '/video.mkv',
    videoKey: 'key1',
    source: 'external',
    language,
    languageLabel: language,
    label: language,
    format: 'ass',
    path: `/subs.${language}.ass`,
  };
}

describe('getSubtitleGenerationHints', () => {
  it('recommends existing subtitles in target language', () => {
    const hints = getSubtitleGenerationHints([externalTrack('ru')], 'ru', false);
    expect(hints.hasExternalInTargetLanguage).toBe(true);
    expect(hints.canTranslateExisting).toBe(true);
    expect(hints.recommendTranslateExisting).toBe(true);
  });

  it('requires translation backend for cross-language external subtitles', () => {
    const hints = getSubtitleGenerationHints([externalTrack('en')], 'ru', false);
    expect(hints.hasExternalForTranslation).toBe(true);
    expect(hints.canTranslateExisting).toBe(false);
    const withTranslation = getSubtitleGenerationHints([externalTrack('en')], 'ru', true);
    expect(withTranslation.canTranslateExisting).toBe(true);
  });
});
