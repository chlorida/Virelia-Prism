import { describe, expect, it } from 'vitest';
import { buildSubtitleMenuModel } from './subtitleMenuModel';
import { getSubtitleGenerationHints, pickSourceSubtitleForTranslation } from './subtitleGenerationHints';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';

function track(partial: Partial<SubtitleTrack> & Pick<SubtitleTrack, 'id' | 'language' | 'source'>): SubtitleTrack {
  return {
    videoId: 'v1',
    videoPath: '/video.mkv',
    videoKey: 'key1',
    languageLabel: partial.language,
    label: partial.label ?? partial.language,
    format: 'ass',
    ...partial,
  };
}

describe('subtitle translation availability', () => {
  it('requires translation backend for cross-language external subtitles', () => {
    const external = [track({ id: 'e1', language: 'ru', source: 'external' })];
    const hintsOff = getSubtitleGenerationHints(external, 'en', false);
    const hintsOn = getSubtitleGenerationHints(external, 'en', true);
    expect(hintsOff.canTranslateExisting).toBe(false);
    expect(hintsOn.canTranslateExisting).toBe(true);
    expect(hintsOn.hasExternalForTranslation).toBe(true);
  });

  it('disables translate button when backend missing', () => {
    const tracks = [track({ id: 'e1', language: 'ru', source: 'external' })];
    const model = buildSubtitleMenuModel(tracks, 'en', false);
    expect(model.showTranslateButton).toBe(true);
    expect(model.translateEnabled).toBe(false);
  });

  it('picks Russian external subtitle as translation source for English output', () => {
    const tracks = [
      track({ id: 'e1', language: 'ru', source: 'external', path: '/subs/ep02.ru.ass' }),
      track({ id: 'e2', language: 'ja', source: 'external', path: '/subs/ep02.ja.ass' }),
    ];
    const picked = pickSourceSubtitleForTranslation(tracks, 'en');
    expect(picked?.id).toBe('e1');
    expect(picked?.path).toContain('.ru.ass');
  });

  it('uses distinct source and target language in hints', () => {
    const external = [track({ id: 'e1', language: 'ja', source: 'external' })];
    expect(getSubtitleGenerationHints(external, 'ru', true).canTranslateExisting).toBe(true);
    expect(getSubtitleGenerationHints(external, 'ja', true).hasExternalInTargetLanguage).toBe(true);
  });
});
