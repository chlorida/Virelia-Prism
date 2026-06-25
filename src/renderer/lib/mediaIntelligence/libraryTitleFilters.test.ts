import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import type { LibraryTitle } from './types';
import {
  filterBrowsableLibraryTitles,
  filterMediaByContentMode,
  filterShelfLibraryTitles,
  filterTitlesByContentMode,
  hasMeaningfulTitleName,
  isBrowsableLibraryTitle,
  isMusicTitle,
  looksLikeGenericFileStem,
  looksLikeRecordingOrAssetTitle,
} from './libraryTitleFilters';

const audioItem: MediaItem = {
  id: 'a1',
  title: 'Track',
  fileName: '01-track.mp3',
  filePath: 'D:/music/01-track.mp3',
  folder: 'D:/music',
  kind: 'audio',
  tags: [],
  addedAt: '0',
  favorite: false,
  mtimeMs: 0,
};

const videoItem: MediaItem = {
  ...audioItem,
  id: 'v1',
  kind: 'video',
  fileName: '[Group] Higurashi Gou [01].mkv',
  filePath: 'D:/anime/ep.mkv',
};

function title(overrides: Partial<LibraryTitle>): LibraryTitle {
  return {
    id: 'work:test:na',
    canonicalTitle: 'Test',
    displayTitle: 'Test',
    mediaType: 'unknown',
    items: [videoItem],
    uniqueEpisodeCount: 1,
    totalFileCount: 1,
    duplicateVersionCount: 0,
    confidence: 0.5,
    source: 'local-parser',
    ...overrides,
  };
}

const albumTitle: LibraryTitle = {
  id: 'album:1',
  canonicalTitle: 'Album',
  displayTitle: 'Album',
  mediaType: 'album',
  items: [audioItem, { ...audioItem, id: 'a2', fileName: '02-track.mp3' }],
  uniqueEpisodeCount: 2,
  totalFileCount: 2,
  duplicateVersionCount: 0,
  confidence: 0.8,
  source: 'local-parser',
};

const seriesTitle: LibraryTitle = {
  ...albumTitle,
  id: 'series:1',
  displayTitle: 'Higurashi Gou',
  mediaType: 'series',
  items: [
    videoItem,
    { ...videoItem, id: 'v2', fileName: '[Group] Higurashi Gou [02].mkv' },
  ],
  franchiseId: 'higurashi',
  episodes: [
    { id: 'e1', titleId: 'series:1', episodeNumber: 1, displayTitle: 'EP01', versions: [] },
    { id: 'e2', titleId: 'series:1', episodeNumber: 2, displayTitle: 'EP02', versions: [] },
  ],
};

describe('libraryTitleFilters', () => {
  it('detects music titles', () => {
    expect(isMusicTitle(albumTitle)).toBe(true);
    expect(isMusicTitle(seriesTitle)).toBe(false);
  });

  it('filters titles and media by content mode', () => {
    const titles = [albumTitle, seriesTitle];
    expect(filterTitlesByContentMode(titles, 'music')).toEqual([albumTitle]);
    expect(filterTitlesByContentMode(titles, 'video')).toEqual([seriesTitle]);
    expect(filterMediaByContentMode([audioItem, videoItem], 'music')).toEqual([audioItem]);
    expect(filterMediaByContentMode([audioItem, videoItem], 'video')).toEqual([videoItem]);
  });

  it('flags generic filename stems', () => {
    expect(looksLikeGenericFileStem('0802')).toBe(true);
    expect(looksLikeGenericFileStem('0802(1)')).toBe(true);
    expect(looksLikeGenericFileStem('0101-0230')).toBe(true);
    expect(looksLikeGenericFileStem('0604 (1)')).toBe(true);
    expect(looksLikeGenericFileStem('01 Showcase')).toBe(true);
    expect(looksLikeGenericFileStem('Sonic the Hedgehog The Movie')).toBe(false);
  });

  it('flags screen recordings and asset titles', () => {
    expect(looksLikeRecordingOrAssetTitle('Моя Бумажная Принцесса 🤍 2025-03-24')).toBe(true);
    expect(looksLikeRecordingOrAssetTitle('Фон Обычный')).toBe(true);
    expect(looksLikeRecordingOrAssetTitle('Higurashi Gou')).toBe(false);
  });

  it('rejects random single files from the titles shelf', () => {
    expect(isBrowsableLibraryTitle(title({ displayTitle: '0802', canonicalTitle: '0802' }))).toBe(false);
    expect(isBrowsableLibraryTitle(title({ displayTitle: '0101-0230' }))).toBe(false);
    expect(isBrowsableLibraryTitle(title({ displayTitle: 'Valve' }))).toBe(false);
    expect(isBrowsableLibraryTitle(title({ displayTitle: 'GROUP' }))).toBe(false);
  });

  it('rejects screen recording collections masquerading as series', () => {
    const recordings = title({
      displayTitle: 'Моя Бумажная Принцесса 🤍 2025-03-24',
      mediaType: 'series',
      items: [
        { ...videoItem, id: 'r1', fileName: 'Моя Бумажная Принцесса 🤍 2025-03-24.mp4' },
        { ...videoItem, id: 'r2', fileName: 'Моя Бумажная Принцесса 🤍 2025-03-25.mp4' },
      ],
      episodes: [
        { id: 'e1', titleId: 'x', episodeNumber: 1, displayTitle: '1', versions: [] },
        { id: 'e2', titleId: 'x', episodeNumber: 2, displayTitle: '2', versions: [] },
      ],
    });
    expect(isBrowsableLibraryTitle(recordings)).toBe(false);

    const backgrounds = title({
      displayTitle: 'Фон Обычный',
      mediaType: 'series',
      items: Array.from({ length: 4 }, (_, index) => ({
        ...videoItem,
        id: `bg-${index}`,
        fileName: `Фон Обычный ${index + 1}.mp4`,
      })),
      episodes: Array.from({ length: 4 }, (_, index) => ({
        id: `ep-${index}`,
        titleId: 'x',
        episodeNumber: index + 1,
        displayTitle: `BG ${index + 1}`,
        versions: [],
      })),
    });
    expect(isBrowsableLibraryTitle(backgrounds)).toBe(false);
  });

  it('allows real works on the titles shelf', () => {
    expect(isBrowsableLibraryTitle(seriesTitle)).toBe(true);
    expect(isBrowsableLibraryTitle(title({
      displayTitle: 'Sonic the Hedgehog: The Movie',
      canonicalTitle: 'Sonic the Hedgehog: The Movie',
      mediaType: 'movie',
      year: 1996,
      items: [{ ...videoItem, fileName: 'Sonic the Hedgehog The Movie 1996.mkv' }],
    }))).toBe(true);
    expect(hasMeaningfulTitleName(title({
      displayTitle: 'Higurashi Gou',
      franchiseId: 'higurashi',
      mediaType: 'series',
      episodes: [{ id: 'e1', titleId: 'x', episodeNumber: 1, displayTitle: 'EP01', versions: [] }],
    }))).toBe(true);
  });

  it('filterShelfLibraryTitles keeps only browsable video titles', () => {
    const junk = title({ displayTitle: '0802' });
    const result = filterShelfLibraryTitles([seriesTitle, junk, albumTitle], 'video');
    expect(result).toEqual([seriesTitle]);
  });
});
