import { describe, expect, it } from 'vitest';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import {
  filterTracksForVideo,
  findTrackForVideo,
  makeVideoKey,
} from './subtitleScope';

function track(partial: Partial<SubtitleTrack> & Pick<SubtitleTrack, 'id' | 'videoKey' | 'source'>): SubtitleTrack {
  return {
    videoId: partial.videoKey,
    videoPath: partial.videoPath ?? `/videos/${partial.videoKey}.mkv`,
    language: 'ru',
    languageLabel: 'Russian',
    label: partial.label ?? 'test',
    format: 'ass',
    ...partial,
  };
}

describe('makeVideoKey', () => {
  it('uses stable media id hash', () => {
    expect(makeVideoKey('abc123')).toBe('abc123');
    expect(makeVideoKey('gou-ep01')).not.toBe(makeVideoKey('sotsu-ep01'));
  });
});

describe('filterTracksForVideo', () => {
  it('returns only tracks for current video key', () => {
    const tracks = [
      track({ id: 'sotsu-ext', videoKey: 'sotsu-key', source: 'external', label: 'Sotsu' }),
      track({ id: 'gou-ext', videoKey: 'gou-key', source: 'external', label: 'Gou' }),
      track({ id: 'gou-gen', videoKey: 'gou-key', source: 'generated', label: 'Generated' }),
    ];
    const gouOnly = filterTracksForVideo(tracks, 'gou-key');
    expect(gouOnly.map((tr) => tr.id)).toEqual(['gou-ext', 'gou-gen']);
  });
});

describe('stale selectedTrack guard', () => {
  it('rejects track from another video key', () => {
    const tracks = [
      track({ id: 'stale', videoKey: 'sotsu-key', source: 'external' }),
    ];
    expect(findTrackForVideo(tracks, 'stale', 'gou-key', '/gou/ep01.mkv')).toBeNull();
  });

  it('accepts track for matching video key', () => {
    const tracks = [
      track({ id: 'ok', videoKey: 'gou-key', source: 'external', videoPath: '/gou/ep01.mkv' }),
    ];
    expect(findTrackForVideo(tracks, 'ok', 'gou-key', '/gou/ep01.mkv')?.id).toBe('ok');
  });
});
