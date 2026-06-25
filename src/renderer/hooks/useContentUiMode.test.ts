import { describe, expect, it } from 'vitest';
import { resolveContentUiMode } from './useContentUiMode';

const base = {
  isVideo: false,
  isPreviewVisible: false,
  isPreviewCollapsed: false,
  hasTrack: false,
  playbackStatus: 'idle' as const,
  videoTheater: false
};

describe('resolveContentUiMode', () => {
  it('returns library when nothing is focused', () => {
    expect(resolveContentUiMode(base)).toBe('library');
  });

  it('returns audio for an active audio track', () => {
    expect(resolveContentUiMode({ ...base, hasTrack: true })).toBe('audio');
  });

  it('returns video-preview for expanded video', () => {
    expect(resolveContentUiMode({
      ...base,
      isVideo: true,
      isPreviewVisible: true,
      hasTrack: true,
      playbackStatus: 'playing'
    })).toBe('video-preview');
  });

  it('returns library when video preview is collapsed', () => {
    expect(resolveContentUiMode({
      ...base,
      isVideo: true,
      isPreviewVisible: true,
      isPreviewCollapsed: true,
      hasTrack: true
    })).toBe('library');
  });

  it('returns video-theater when theater flag is set', () => {
    expect(resolveContentUiMode({
      ...base,
      isVideo: true,
      isPreviewVisible: true,
      videoTheater: true,
      hasTrack: true
    })).toBe('video-theater');
  });
});
