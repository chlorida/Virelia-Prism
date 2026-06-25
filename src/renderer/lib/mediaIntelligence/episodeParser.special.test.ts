import { describe, expect, it } from 'vitest';
import { parseMediaIdentity, isSpecialMedia } from './episodeParser';
import { buildMediaDisplayIdentity } from './mediaIdentityService';
import type { MediaItem } from '../../../shared/types';
import { buildSeriesGroup } from './seriesGrouping';

function fakeItem(fileName: string, folder = 'D:/Downloads'): MediaItem {
  return {
    id: fileName,
    kind: 'video',
    filePath: `${folder}/${fileName}`,
    fileName,
    folder,
    title: fileName,
    tags: [],
    addedAt: '',
    favorite: false,
    durationSeconds: 3300,
  };
}

describe('OVA / special parsing', () => {
  it('parses tilde Outbreak OVA filename', () => {
    const id = parseMediaIdentity(
      '',
      'Hi10p Dvdrip Higurashi no Naku Koro ni Kaku ~outbreak~ OVA.mkv'
    );
    expect(id.isSpecial).toBe(true);
    expect(id.specialType).toBe('OVA');
    expect(id.specialTitle?.toLowerCase()).toBe('outbreak');
    expect(id.episodeNumber).toBeUndefined();
    expect(isSpecialMedia(id)).toBe(true);
  });

  it('uses localized English display for Outbreak', () => {
    const display = buildMediaDisplayIdentity(
      fakeItem('Hi10p Dvdrip Higurashi no Naku Koro ni Kaku ~outbreak~ OVA.mkv'),
      'en'
    );
    expect(display.title).toMatch(/When They Cry/i);
    expect(display.title.toLowerCase()).toContain('outbreak');
    expect(display.technicalChips).toContain('OVA');
  });

  it('excludes special from numbered episode series group', () => {
    const folder = 'D:/Anime/Sotsu';
    const episodes = Array.from({ length: 3 }, (_, i) =>
      fakeItem(`[Group] Higurashi Sotsu [${String(i + 1).padStart(2, '0')}].mkv`, folder)
    );
    const special = fakeItem('Hi10p Dvdrip Higurashi no Naku Koro ni Kaku ~outbreak~ OVA.mkv', folder);
    const group = buildSeriesGroup('sotsu', folder, [...episodes, special], 'en');
    expect(group.episodes.every((ep) => ep.episodeNumber != null)).toBe(true);
    expect(group.episodes).toHaveLength(3);
  });
});
