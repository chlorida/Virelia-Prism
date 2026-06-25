import { describe, expect, it } from 'vitest';
import { filterAndSortMedia } from './search';
import { buildSearchText } from './mediaIndex';
import type { MediaItem } from '../../shared/types';

const items: MediaItem[] = [
  {
    id: '1',
    filePath: 'D:/Music/Alpha.mp3',
    fileName: 'Alpha.mp3',
    folder: 'D:/Music',
    title: 'Alpha',
    artist: 'Nova',
    album: 'First Light',
    tags: ['synth'],
    kind: 'audio',
    durationSeconds: 120,
    addedAt: '2026-01-01T00:00:00.000Z',
    favorite: true
  },
  {
    id: '2',
    filePath: 'D:/Videos/Beta.mp4',
    fileName: 'Beta.mp4',
    folder: 'D:/Videos',
    title: 'Beta Window',
    artist: 'Prism',
    album: 'Motion',
    tags: ['cinema'],
    kind: 'video',
    durationSeconds: 360,
    addedAt: '2026-01-02T00:00:00.000Z',
    favorite: false,
    lastPlayedAt: '2026-01-03T00:00:00.000Z'
  }
];

describe('filterAndSortMedia', () => {
  it('searches across filename, folder, title, artist, album, and tags', () => {
    expect(filterAndSortMedia(items, { query: 'nova', filter: 'all', sort: 'alphabetical' }).items).toHaveLength(1);
    expect(filterAndSortMedia(items, { query: 'videos', filter: 'all', sort: 'alphabetical' }).items[0].id).toBe('2');
    expect(filterAndSortMedia(items, { query: 'cinema', filter: 'all', sort: 'alphabetical' }).items[0].id).toBe('2');
  });

  it('filters favorites and recently played media', () => {
    expect(filterAndSortMedia(items, { query: '', filter: 'favorites', sort: 'alphabetical' }).items.map((item) => item.id)).toEqual(['1']);
    expect(filterAndSortMedia(items, { query: '', filter: 'recent', sort: 'recent' }).items.map((item) => item.id)).toEqual(['2']);
  });

  it('sorts by duration descending when requested', () => {
    expect(filterAndSortMedia(items, { query: '', filter: 'all', sort: 'duration' }).items.map((item) => item.id)).toEqual(['2', '1']);
  });

  it('uses precomputed searchText when present', () => {
    const indexed = items.map((item) => ({ ...item, searchText: buildSearchText(item) }));
    expect(filterAndSortMedia(indexed, { query: 'nova', filter: 'all', sort: 'alphabetical' }).items[0].id).toBe('1');
  });

  it('returns the full sorted list for large libraries', () => {
    const huge = Array.from({ length: 5607 }, (_, index) => ({
      ...items[0],
      id: String(index),
      title: `Track ${index.toString().padStart(5, '0')}`
    })).sort((left, right) => left.title.localeCompare(right.title));

    const result = filterAndSortMedia(huge, { query: '', filter: 'all', sort: 'alphabetical' });
    expect(result.items).toHaveLength(huge.length);
    expect(result.totalMatches).toBe(huge.length);
    expect(result.capped).toBe(false);
  });

  it('uses duration fast-path when durationSorted is provided', () => {
    const huge = Array.from({ length: 1200 }, (_, index) => ({
      ...items[0],
      id: String(index),
      title: `Track ${index}`,
      durationSeconds: index
    }));
    const durationSorted = [...huge].sort((left, right) => (right.durationSeconds ?? 0) - (left.durationSeconds ?? 0));
    const result = filterAndSortMedia(huge, {
      query: '',
      filter: 'all',
      sort: 'duration',
      durationSorted
    });
    expect(result.items).toHaveLength(huge.length);
    expect(result.items[0].durationSeconds).toBe(huge.length - 1);
  });
});
