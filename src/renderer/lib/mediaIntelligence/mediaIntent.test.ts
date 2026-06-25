import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { detectMediaIntent } from './mediaIntent';

function video(fileName: string, extra: Partial<MediaItem> = {}): MediaItem {
  return {
    id: fileName,
    filePath: `D:/Anime/${fileName}`,
    fileName,
    folder: 'D:/Anime/Show',
    title: fileName,
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
    ...extra,
  };
}

describe('detectMediaIntent', () => {
  it('detects anime episode', () => {
    const r = detectMediaIntent(video('[SubsPlease] Example Anime - 03 (1080p).mkv'));
    expect(r.mediaIntent).toBe('anime-episode');
  });

  it('detects music-video from MV keyword', () => {
    const r = detectMediaIntent(video('Artist Name - Song Title MV.mp4', { durationSeconds: 240 }));
    expect(r.mediaIntent).toBe('music-video');
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it('defaults unknown video to watch path', () => {
    const r = detectMediaIntent(video('random_clip_2024.mp4', { durationSeconds: 600 }));
    expect(['unknown-video', 'movie', 'short-video']).toContain(r.mediaIntent);
  });
});
