import { describe, expect, it } from 'vitest';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { shouldShowGlobalPlaybackError } from './subtitleTrackStatus';

function track(partial: Partial<SubtitleTrack> & Pick<SubtitleTrack, 'id' | 'source'>): SubtitleTrack {
  return {
    videoId: 'v1',
    videoPath: '/video.mkv',
    videoKey: 'v1',
    language: 'ru',
    languageLabel: 'Russian',
    label: 'Russian — ass',
    format: 'ass',
    ...partial,
  };
}

describe('shouldShowGlobalPlaybackError', () => {
  it('hides generated validation error when external track is selected', () => {
    const external = track({ id: 'ext', source: 'external' });
    expect(
      shouldShowGlobalPlaybackError({
        playbackError: 'Generated subtitles contain repeated hallucinated text.',
        playbackErrorKind: 'validation',
        playbackErrorTrackId: 'gen',
        selectedTrackId: 'ext',
        selectedTrack: external,
      }),
    ).toBe(false);
  });

  it('shows parse error for the active external track', () => {
    const external = track({ id: 'ext', source: 'external' });
    expect(
      shouldShowGlobalPlaybackError({
        playbackError: 'Failed to parse subtitle file',
        playbackErrorKind: 'parse',
        playbackErrorTrackId: 'ext',
        selectedTrackId: 'ext',
        selectedTrack: external,
      }),
    ).toBe(true);
  });

  it('hides stale playback error when another track is selected', () => {
    const external = track({ id: 'ext', source: 'external' });
    expect(
      shouldShowGlobalPlaybackError({
        playbackError: 'Old error',
        playbackErrorKind: 'parse',
        playbackErrorTrackId: 'other',
        selectedTrackId: 'ext',
        selectedTrack: external,
      }),
    ).toBe(false);
  });
});
