import { describe, expect, it } from 'vitest';
import { defaultTargetSubtitleLanguage, pickAutoSubtitleTrack } from './subtitleSelection';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';

function track(partial: Partial<SubtitleTrack> & Pick<SubtitleTrack, 'id' | 'source' | 'language'>): SubtitleTrack {
  const videoKey = partial.videoKey ?? 'v1';
  return {
    videoId: videoKey,
    videoPath: partial.videoPath ?? '/library/video.mkv',
    videoKey,
    languageLabel: partial.language,
    label: partial.label ?? partial.language,
    format: 'srt',
    ...partial,
  };
}

describe('pickAutoSubtitleTrack', () => {
  it('prefers original over generated for matching language', () => {
    const tracks = [
      track({ id: 'g1', source: 'generated', language: 'en', generationValid: true }),
      track({ id: 'o1', source: 'external', language: 'en' }),
    ];
    expect(pickAutoSubtitleTrack(tracks, 'en')?.id).toBe('o1');
  });

  it('falls back to first original when language not found', () => {
    const tracks = [
      track({ id: 'o-ru', source: 'external', language: 'ru' }),
      track({ id: 'g-en', source: 'generated', language: 'en', generationValid: true }),
    ];
    expect(pickAutoSubtitleTrack(tracks, 'ja')?.id).toBe('o-ru');
  });

  it('uses generated when no originals exist', () => {
    const tracks = [track({ id: 'g1', source: 'generated', language: 'ru', generationValid: true })];
    expect(pickAutoSubtitleTrack(tracks, 'ru')?.id).toBe('g1');
  });

  it('prefers external in target language over generated', () => {
    const tracks = [
      track({ id: 'g-en', source: 'generated', language: 'en', generationValid: true }),
      track({ id: 'ext-ru', source: 'external', language: 'ru' }),
    ];
    expect(pickAutoSubtitleTrack(tracks, 'auto', 'ru')?.id).toBe('ext-ru');
  });

  it('never auto-selects invalid generated tracks', () => {
    const tracks = [
      track({
        id: 'g-bad',
        source: 'generated',
        language: 'en',
        generationValid: false,
        generationInvalidReason: 'repeated_hallucinated_text',
      }),
      track({ id: 'ext-ru', source: 'external', language: 'ru' }),
    ];
    expect(pickAutoSubtitleTrack(tracks, 'en', 'en')?.id).toBe('ext-ru');
  });

  it('prefers embedded after external and generated for target language', () => {
    const tracks = [
      track({ id: 'emb', source: 'embedded', language: 'ja' }),
      track({ id: 'ext-en', source: 'external', language: 'en' }),
    ];
    expect(pickAutoSubtitleTrack(tracks, 'auto', 'en')?.id).toBe('ext-en');
  });
});

describe('defaultTargetSubtitleLanguage', () => {
  it('defaults to Russian when UI is Russian', () => {
    expect(defaultTargetSubtitleLanguage('ru')).toBe('ru');
  });

  it('defaults to English when UI is English', () => {
    expect(defaultTargetSubtitleLanguage('en')).toBe('en');
  });
});
