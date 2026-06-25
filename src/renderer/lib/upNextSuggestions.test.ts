import { describe, expect, it } from 'vitest';
import { buildUpNextEntries, pickHeroNext } from './upNextSuggestions';
import type { MediaItem } from '../../shared/types';

function item(id: string, folder: string, kind: 'audio' | 'video' = 'video'): MediaItem {
  const extension = kind === 'audio' ? 'flac' : 'mp4';
  return {
    id,
    kind,
    title: id,
    fileName: `${id}.${extension}`,
    folder,
    folderLabel: folder,
    filePath: `C:/media/${folder}/${id}.${extension}`,
    durationSeconds: 120,
    favorite: false,
    tags: [],
    addedAt: '2024-01-01T00:00:00.000Z'
  };
}

describe('buildUpNextSuggestions', () => {
  it('prefers same folder video before audio', () => {
    const current = item('a', 'Shows', 'video');
    const visible = [current, item('b', 'Shows', 'video'), item('c', 'Shows', 'audio')];
    const entries = buildUpNextEntries(current, visible, []);
    expect(entries[0]?.item.id).toBe('b');
    const firstAudio = entries.findIndex((e) => e.item.kind === 'audio');
    const firstVideo = entries.findIndex((e) => e.item.kind === 'video');
    expect(firstVideo).toBeLessThan(firstAudio);
  });

  it('hero never picks audio when videos exist', () => {
    const current = item('a', 'Shows', 'video');
    const visible = [current, item('b', 'Other', 'video'), item('c', 'Shows', 'audio')];
    const hero = pickHeroNext(current, visible);
    expect(hero?.item.kind).toBe('video');
  });
});
