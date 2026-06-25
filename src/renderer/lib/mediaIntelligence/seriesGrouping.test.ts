import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { buildSeriesGroup, findNextEpisodeInSeries } from './seriesGrouping';

function ep(id: string, fileName: string, folder = 'Anime/Sotsu'): MediaItem {
  return {
    id,
    kind: 'video',
    fileName,
    title: fileName,
    folder,
    filePath: `D:/${folder}/${fileName}`,
    tags: [],
    addedAt: '',
    favorite: false,
  };
}

describe('findNextEpisodeInSeries', () => {
  it('finds episode 03 after episode 02 when episode 03 exists', () => {
    const items = [
      ep('e1', '[Group] Higurashi Sotsu [01].mkv'),
      ep('e2', '[Group] Higurashi Sotsu [02].mkv'),
      ep('e3', '[Group] Higurashi Sotsu [03].mkv'),
      ep('e15', '[Group] Higurashi Sotsu [15].mkv'),
    ];
    const group = buildSeriesGroup('sotsu', items[0]!.folder, items);
    expect(findNextEpisodeInSeries(items[1]!, group)?.id).toBe('e3');
  });

  it('uses next available episode number when intermediate episodes are missing', () => {
    const items = [
      ep('e1', '[Group] Higurashi Sotsu [01].mkv'),
      ep('e2', '[Group] Higurashi Sotsu [02].mkv'),
      ep('e15', '[Group] Higurashi Sotsu [15].mkv'),
    ];
    const group = buildSeriesGroup('sotsu', items[0]!.folder, items);
    expect(findNextEpisodeInSeries(items[1]!, group)?.id).toBe('e15');
  });

  it('dedupes duplicate episode 02 copies when finding next episode', () => {
    const items = [
      ep('e1', '[Group] Higurashi Sotsu [01].mkv'),
      ep('e2a', '[Group] Higurashi Sotsu [02].mkv', 'Anime/Sotsu'),
      ep('e2b', '[Group] Higurashi Sotsu [02].mkv', 'Copy/Sotsu'),
      ep('e3', '[Group] Higurashi Sotsu [03].mkv'),
    ];
    const group = buildSeriesGroup('sotsu', items[0]!.folder, items);
    expect(group.episodes.length).toBe(3);
    expect(findNextEpisodeInSeries(items[1]!, group)?.id).toBe('e3');
  });
});
