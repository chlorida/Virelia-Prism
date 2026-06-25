import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { parseMediaIdentity } from './episodeParser';
import { buildSmartUpNextPlan } from './smartUpNextService';

function item(folder: string, fileName: string, id?: string): MediaItem {
  return {
    id: id ?? fileName,
    filePath: `${folder}/${fileName}`,
    fileName,
    folder,
    folderLabel: folder,
    title: fileName,
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
  };
}

describe('generic parser (no franchise hardcode)', () => {
  it('parses SubsPlease anime release', () => {
    const id = parseMediaIdentity('', '[SubsPlease] Example Anime - 03 (1080p).mkv');
    expect(id.episodeNumber).toBe(3);
    expect(id.probableSeriesTitle).toMatch(/Example Anime/i);
    expect(id.releaseGroup).toBe('SubsPlease');
  });

  it('parses generic movie filename', () => {
    const id = parseMediaIdentity('', 'Movie.Title.2021.1080p.BluRay.x264.mkv');
    expect(id.isSpecial).toBe(true);
    expect(id.specialType).toBe('Movie');
    expect(id.year).toBe(2021);
    expect(id.container).toBe('MKV');
  });

  it('recommends next episode in generic numbered folder', () => {
    const folder = 'D:/Shows/GenericShow';
    const catalog = [
      item(folder, 'Episode 01.mkv', 'e1'),
      item(folder, 'Episode 02.mkv', 'e2'),
      item(folder, 'Episode 03.mkv', 'e3'),
    ];
    const plan = buildSmartUpNextPlan(catalog[0], catalog, [], 'en');
    expect(plan.hero?.item.id).toBe('e2');
  });
});
