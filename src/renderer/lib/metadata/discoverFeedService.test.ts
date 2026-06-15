import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTitle } from '../mediaIntelligence/types';
import type { MediaItem } from '../../../shared/types';
import { buildUserAffinityProfile } from './userAffinityService';
import {
  getNextDiscoverSections,
  INITIAL_DISCOVER_FEED_CURSOR,
  type DiscoverFeedContext,
  type DiscoverFeedCursor,
} from './discoverFeedService';
import type { MetadataSearchResult } from './types';
import * as discoverCatalogService from './discoverCatalogService';
import { invalidateDiscoverCache } from './recommendationService';

type TitleFixture = LibraryTitle & { genres?: string[] };

function searchResult(
  title: string,
  extra: Partial<MetadataSearchResult> = {}
): MetadataSearchResult {
  return {
    catalogId: `test:${title}`,
    provider: 'test',
    providerId: title,
    title,
    type: 'movie',
    popularity: 1000,
    confidence: 0.8,
    source: 'test',
    ...extra,
  };
}

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

function coldContext(): DiscoverFeedContext {
  return {
    libraryTitles: [],
    mediaItems: [],
    favoriteIds: new Set(),
    watchlistCatalogIds: [],
    includeAdultContent: false,
    affinity: buildUserAffinityProfile({
      libraryTitles: [],
      mediaItems: [],
      favoriteIds: new Set(),
      watchlistCatalogIds: [],
    }),
  };
}

describe('discoverFeedService', () => {
  beforeEach(() => {
    invalidateDiscoverCache();
    vi.restoreAllMocks();
  });

  it('cold start returns trending before remainingGenres', async () => {
    vi.spyOn(discoverCatalogService, 'fetchDiscoverSectionPage').mockImplementation(
      async (sectionId: string) => {
        if (sectionId === 'trending') {
          return [searchResult('Trending Hit', { genres: ['Action'] })];
        }
        if (sectionId === 'popular-movies') {
          return [searchResult('Popular Movie', { genres: ['Drama'] })];
        }
        if (sectionId === 'popular-series') return [];
        if (sectionId === 'popular-anime') return [];
        if (sectionId.startsWith('genre-')) {
          return [
            searchResult(`${sectionId} A`, { genres: ['Comedy'] }),
            searchResult(`${sectionId} B`, { genres: ['Comedy'] }),
            searchResult(`${sectionId} C`, { genres: ['Comedy'] }),
            searchResult(`${sectionId} D`, { genres: ['Comedy'] }),
          ];
        }
        return [];
      }
    );

    const context = coldContext();
    let cursor: DiscoverFeedCursor | null = INITIAL_DISCOVER_FEED_CURSOR;
    const sectionOrder: string[] = [];

    while (cursor) {
      const { sections, nextCursor } = await getNextDiscoverSections(cursor, context);
      sectionOrder.push(...sections.map((section) => section.id));
      cursor = nextCursor;
    }

    const firstTrendingIdx = sectionOrder.findIndex(
      (id) => id === 'trending' || id.startsWith('popular-')
    );
    const firstGenreIdx = sectionOrder.findIndex((id) => id.startsWith('genre-'));
    expect(firstTrendingIdx).toBeGreaterThanOrEqual(0);
    expect(firstGenreIdx).toBeGreaterThan(firstTrendingIdx);
  });

  it('with Drama affinity, drama genre section appears in affinityGenres phase', async () => {
    vi.spyOn(discoverCatalogService, 'fetchDiscoverSectionPage').mockImplementation(
      async (sectionId: string) => {
        if (sectionId === 'genre-drama') {
          return [
            searchResult('Drama One', { genres: ['Drama'] }),
            searchResult('Drama Two', { genres: ['Drama'] }),
            searchResult('Drama Three', { genres: ['Drama'] }),
            searchResult('Drama Four', { genres: ['Drama'] }),
          ];
        }
        if (sectionId.startsWith('genre-')) {
          return [
            searchResult(`${sectionId} One`, { genres: ['Comedy'] }),
            searchResult(`${sectionId} Two`, { genres: ['Comedy'] }),
            searchResult(`${sectionId} Three`, { genres: ['Comedy'] }),
            searchResult(`${sectionId} Four`, { genres: ['Comedy'] }),
          ];
        }
        if (sectionId === 'trending') return [searchResult('Trending')];
        return [];
      }
    );

    const watched = media({
      id: 'm1',
      durationSeconds: 1000,
      resumePositionSeconds: 800,
    });
    const titles = [
      libraryTitle({
        id: 't1',
        displayTitle: 'Drama Show',
        genres: ['Drama'],
        items: [watched],
      }),
    ];
    const affinity = buildUserAffinityProfile({
      libraryTitles: titles,
      mediaItems: [watched],
      favoriteIds: new Set(),
      watchlistCatalogIds: [],
    });

    const context: DiscoverFeedContext = {
      libraryTitles: titles,
      mediaItems: [watched],
      favoriteIds: new Set(),
      watchlistCatalogIds: [],
      includeAdultContent: false,
      affinity,
    };

    let cursor: DiscoverFeedCursor | null = INITIAL_DISCOVER_FEED_CURSOR;
    const sectionOrder: string[] = [];

    while (cursor) {
      const { sections, nextCursor } = await getNextDiscoverSections(cursor, context);
      sectionOrder.push(...sections.map((section) => section.id));
      cursor = nextCursor;
    }

    const dramaIdx = sectionOrder.indexOf('genre-drama');
    const trendingIdx = sectionOrder.findIndex((id) => id === 'trending');
    expect(dramaIdx).toBeGreaterThanOrEqual(0);
    expect(trendingIdx === -1 || dramaIdx < trendingIdx).toBe(true);
  });

  it('cursor advances and does not duplicate section ids', async () => {
    vi.spyOn(discoverCatalogService, 'fetchDiscoverSectionPage').mockImplementation(
      async (sectionId: string) => {
        if (sectionId === 'trending') return [searchResult('Trending')];
        if (sectionId === 'popular-movies') return [searchResult('Movie')];
        if (sectionId === 'popular-series') return [searchResult('Series', { type: 'series' })];
        if (sectionId === 'popular-anime') return [searchResult('Anime', { type: 'anime' })];
        if (sectionId.startsWith('genre-')) {
          return [
            searchResult(`${sectionId} 1`),
            searchResult(`${sectionId} 2`),
            searchResult(`${sectionId} 3`),
            searchResult(`${sectionId} 4`),
          ];
        }
        return [];
      }
    );

    const context = coldContext();
    let cursor: DiscoverFeedCursor | null = INITIAL_DISCOVER_FEED_CURSOR;
    const seenSectionIds: string[] = [];

    while (cursor) {
      const { sections, nextCursor } = await getNextDiscoverSections(cursor, context);
      for (const section of sections) {
        expect(seenSectionIds).not.toContain(section.id);
        seenSectionIds.push(section.id);
      }
      expect(nextCursor?.shownSectionIds ?? seenSectionIds).toEqual(seenSectionIds);
      cursor = nextCursor;
    }

    expect(seenSectionIds.length).toBeGreaterThan(0);
  });
});
