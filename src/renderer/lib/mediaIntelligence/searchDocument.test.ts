import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { buildSearchBlobFromItem } from './searchDocument';
import { matchesSearchTokens } from '../searchNormalize';
import { filterAndSortMedia } from '../search';

const sotsuEp1: MediaItem = {
  id: 's01',
  kind: 'video',
  filePath: 'D:/Anime/Sotsu/01.mkv',
  fileName: '[VCB-Studio] Higurashi no Naku Koro ni Sotsu [01][Ma10p_1080p][x265_flac].mkv',
  folder: 'D:/Anime/Sotsu',
  title: '[VCB-Studio] Higurashi no Naku Koro ni Sotsu [01][Ma10p_1080p][x265_flac].mkv',
  tags: [],
  addedAt: '',
  favorite: false,
};

const outbreak: MediaItem = {
  id: 'ova1',
  kind: 'video',
  filePath: 'D:/Downloads/outbreak.mkv',
  fileName: 'Hi10p Dvdrip Higurashi no Naku Koro ni Kaku ~outbreak~ OVA.mkv',
  folder: 'D:/Downloads',
  title: 'Hi10p Dvdrip Higurashi no Naku Koro ni Kaku ~outbreak~ OVA.mkv',
  tags: [],
  addedAt: '',
  favorite: false,
};

describe('search document', () => {
  it('indexes English display title for when they cry', () => {
    const blob = buildSearchBlobFromItem(sotsuEp1);
    expect(matchesSearchTokens(blob, 'when they cry')).toBe(true);
    expect(matchesSearchTokens(blob, 'sotsu')).toBe(true);
    expect(matchesSearchTokens(blob, 'episode 01')).toBe(true);
  });

  it('finds outbreak by outbreak, kaku, and franchise phrase', () => {
    const blob = buildSearchBlobFromItem(outbreak);
    expect(matchesSearchTokens(blob, 'outbreak')).toBe(true);
    expect(matchesSearchTokens(blob, 'kaku')).toBe(true);
    expect(matchesSearchTokens(blob, 'when they cry')).toBe(true);
    expect(matchesSearchTokens(blob, 'ova')).toBe(true);
  });

  it('filterAndSortMedia matches display titles not only raw filename', () => {
    const indexed = [sotsuEp1, outbreak].map((item) => ({
      ...item,
      searchText: buildSearchBlobFromItem(item),
    }));
    expect(
      filterAndSortMedia(indexed, { query: 'when they cry', filter: 'all', sort: 'alphabetical' }).totalMatches
    ).toBeGreaterThanOrEqual(1);
    expect(
      filterAndSortMedia(indexed, { query: 'higuras', filter: 'all', sort: 'alphabetical' }).totalMatches
    ).toBeGreaterThanOrEqual(1);
    expect(
      filterAndSortMedia(indexed, { query: 'outbreak', filter: 'all', sort: 'alphabetical' }).items[0]?.id
    ).toBe('ova1');
  });
});
