import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { buildLibraryTitles } from './libraryTitleService';
import { resolveNextEpisodePlayItem } from './titlePlaybackService';

function item(id: string, folder: string, fileName: string): MediaItem {
  return {
    id,
    kind: 'video',
    fileName,
    title: fileName,
    folder,
    filePath: `${folder}/${fileName}`,
    tags: [],
    addedAt: '',
    favorite: false,
    durationSeconds: 1421,
  };
}

describe('resolveNextEpisodePlayItem', () => {
  it('returns episode 04 after episode 03 in Gou series', () => {
    const catalog = [
      item('g01', 'D:/Gou', 'Higurashi No Naku Koro Ni Gou - 01.mkv'),
      item('g02', 'D:/Gou', 'Higurashi No Naku Koro Ni Gou - 02.mkv'),
      item('g03', 'D:/Gou', 'Higurashi No Naku Koro Ni Gou - 03.mkv'),
      item('g04', 'D:/Gou', 'Higurashi No Naku Koro Ni Gou - 04.mkv'),
    ];
    const title = buildLibraryTitles(catalog)[0]!;
    const next = resolveNextEpisodePlayItem(title, 'g03');
    expect(next?.id).toBe('g04');
  });
});
