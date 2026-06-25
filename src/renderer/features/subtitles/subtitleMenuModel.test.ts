import { describe, expect, it } from 'vitest';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { buildSubtitleMenuModel } from './subtitleMenuModel';

function track(partial: Partial<SubtitleTrack> & Pick<SubtitleTrack, 'id' | 'source' | 'language'>): SubtitleTrack {
  return {
    videoId: 'v1',
    videoPath: '/video.mkv',
    videoKey: 'v1',
    languageLabel: partial.language,
    label: partial.label ?? `${partial.language} — file.ass`,
    format: 'ass',
    path: '/subs.ass',
    ...partial,
  };
}

describe('buildSubtitleMenuModel', () => {
  it('lists only valid tracks as available when English generated is invalid', () => {
    const model = buildSubtitleMenuModel(
      [
        track({ id: 'ru', source: 'external', language: 'ru' }),
        track({
          id: 'gen-en',
          source: 'generated',
          language: 'en',
          generationValid: false,
          generationInvalidReason: 'repeated_hallucinated_text',
        }),
      ],
      'en',
      false
    );
    expect(model.availableTracks.map((tr) => tr.id)).toEqual(['ru']);
    expect(model.invalidGenerated.map((tr) => tr.id)).toEqual(['gen-en']);
    expect(model.hasTrackInOutputLanguage).toBe(false);
    expect(model.showTranslateButton).toBe(true);
    expect(model.translateEnabled).toBe(false);
    expect(model.sourceTrackForTranslation?.language).toBe('ru');
    expect(model.displaySourceTrack?.language).toBe('ru');
  });

  it('does not offer translate when output language external already exists', () => {
    const model = buildSubtitleMenuModel(
      [track({ id: 'ru', source: 'external', language: 'ru' })],
      'ru',
      false
    );
    expect(model.hasTrackInOutputLanguage).toBe(true);
    expect(model.showTranslateButton).toBe(false);
  });
});
