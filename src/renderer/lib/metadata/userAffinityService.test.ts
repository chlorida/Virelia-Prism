import { describe, expect, it } from 'vitest';
import { buildUserAffinityProfile } from './userAffinityService';
import type { LibraryTitle } from '../mediaIntelligence/types';
import type { MediaItem } from '../../../shared/types';

type TitleFixture = LibraryTitle & { genres?: string[] };

function libraryTitle(
  partial: Partial<TitleFixture> & Pick<TitleFixture, 'id' | 'displayTitle'>
): TitleFixture {
  return {
    canonicalTitle: partial.displayTitle,
    mediaType: 'series',
    items: [],
    episodes: [],
    uniqueEpisodeCount: 0,
    totalFileCount: 0,
    duplicateVersionCount: 0,
    confidence: 1,
    source: 'local-parser',
    ...partial,
  };
}

function media(partial: Partial<MediaItem> & Pick<MediaItem, 'id'>): MediaItem {
  return {
    kind: 'video',
    title: partial.id,
    fileName: `${partial.id}.mkv`,
    folder: 'D:/test',
    filePath: `D:/test/${partial.id}.mkv`,
    favorite: false,
    tags: [],
    addedAt: new Date().toISOString(),
    ...partial,
  };
}

describe('userAffinityService', () => {
  it('weights Drama genre from watch history', () => {
    const m1 = media({
      id: 'm1',
      durationSeconds: 1000,
      resumePositionSeconds: 500,
    });
    const titles: TitleFixture[] = [
      libraryTitle({
        id: 't1',
        displayTitle: 'Drama Show',
        genres: ['Drama'],
        items: [m1],
      }),
    ];
    const profile = buildUserAffinityProfile({
      libraryTitles: titles,
      mediaItems: [m1],
      favoriteIds: new Set(),
      watchlistCatalogIds: [],
    });
    expect(profile.genreWeights['Drama'] ?? 0).toBeGreaterThan(profile.genreWeights['Comedy'] ?? 0);
    expect(profile.isColdStart).toBe(false);
  });

  it('boosts watchlist catalog ids', () => {
    const profile = buildUserAffinityProfile({
      libraryTitles: [],
      mediaItems: [],
      favoriteIds: new Set(),
      watchlistCatalogIds: ['anilist:123'],
    });
    expect(profile.titleWeights.get('anilist:123') ?? 0).toBeGreaterThan(0.9);
    expect(profile.isColdStart).toBe(false);
  });

  it('cold start when empty input', () => {
    const profile = buildUserAffinityProfile({
      libraryTitles: [],
      mediaItems: [],
      favoriteIds: new Set(),
      watchlistCatalogIds: [],
    });
    expect(profile.isColdStart).toBe(true);
    expect(Object.keys(profile.genreWeights)).toHaveLength(0);
    expect(profile.titleWeights.size).toBe(0);
    expect(profile.franchiseWeights.size).toBe(0);
  });
});
