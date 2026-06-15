import type { MetadataSearchResult } from './types';

import {
  getGatewayAvailability,
  markDirectCatalogFallbackActive,
  prismMetadataGatewayProvider,
} from './prismMetadataGatewayProvider';

import { anilistCatalogProvider } from './providers/anilistCatalogProvider';
import { tmdbCatalogProvider } from './providers/tmdbCatalogProvider';
import { tvmazeCatalogProvider } from './providers/tvmazeCatalogProvider';

import { readOnlineCatalogSettings } from './metadataSettings';

import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from './metadataCache';

import { mergeDuplicateResults, sortResultsByPopularity } from './metadataMergeUtils';

export interface DiscoverCatalogSection {
  id: string;
  titleKey: string;
  subtitleKey?: string;
  source: 'gateway' | 'anilist' | 'tmdb' | 'tvmaze' | 'mixed';
  items: MetadataSearchResult[];
  layout?: 'rail' | 'grid';
}

export const DISCOVER_GENRES = [
  'Comedy',
  'Drama',
  'Action',
  'Horror',
  'Romance',
  'Science-Fiction',
  'Fantasy',
  'Mystery',
  'Crime',
  'Thriller',
  'Animation',
  'Documentary',
] as const;

export function genreSlug(genre: string): string {
  return genre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeGenreToken(value: string): string {
  const token = value.trim().toLowerCase();
  if (token === 'sci-fi' || token === 'science fiction') return 'science-fiction';
  return token;
}

function itemMatchesGenre(item: MetadataSearchResult, genre: string): boolean {
  const target = normalizeGenreToken(genre);
  return (item.genres ?? []).some((entry) => normalizeGenreToken(entry) === target);
}

async function fetchGenrePool(): Promise<MetadataSearchResult[]> {
  const cacheKey = 'discover:genre-pool';
  const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
  if (cached) return cached;

  const [trending, popularSeries, popularMovies, popularAnime] = await Promise.all([
    loadTrendingRail(),
    loadPopularSeriesRail(),
    loadPopularMoviesRail(),
    anilistCatalogProvider.getPopularTitles?.({ limit: 30 }) ?? [],
  ]);

  const pool = mergeDuplicateResults([
    ...trending,
    ...popularSeries,
    ...popularMovies,
    ...popularAnime,
  ]);

  metadataCacheSet(cacheKey, pool, METADATA_CACHE_TTL.discoverRails);
  return pool;
}

function buildGenreSections(pool: MetadataSearchResult[]): DiscoverCatalogSection[] {
  const usedIds = new Set<string>();
  const sections: DiscoverCatalogSection[] = [];

  for (const genre of DISCOVER_GENRES) {
    const items = sortResultsByPopularity(
      pool.filter((item) => itemMatchesGenre(item, genre) && !usedIds.has(item.catalogId))
    ).slice(0, 16);

    if (items.length < 4) continue;

    for (const item of items) usedIds.add(item.catalogId);

    sections.push({
      id: `genre-${genreSlug(genre)}`,
      titleKey: `discover.genre.${genreSlug(genre)}`,
      subtitleKey: 'discover.section.genreSubtitle',
      source: 'mixed',
      layout: 'rail',
      items,
    });
  }

  return sections;
}

async function safeRail(
  loader: () => Promise<MetadataSearchResult[]>,
  cacheKey: string
): Promise<MetadataSearchResult[]> {
  const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
  if (cached) return cached;

  try {
    const items = await loader();
    metadataCacheSet(cacheKey, items, METADATA_CACHE_TTL.discoverRails);
    if (items.length > 0 && cacheKey.startsWith('discover:')) {
      markDirectCatalogFallbackActive();
    }
    return items;
  } catch {
    return [];
  }
}

async function loadTrendingRail(): Promise<MetadataSearchResult[]> {
  if (getGatewayAvailability() === 'available' && prismMetadataGatewayProvider.isConfigured()) {
    const fromGateway = await prismMetadataGatewayProvider.getTrendingTitles?.({ limit: 16 }) ?? [];
    if (fromGateway.length > 0) return fromGateway;
  }

  const [tmdbTrending, tvmazeTrending, anilistTrending] = await Promise.all([
    tmdbCatalogProvider.isConfigured()
      ? tmdbCatalogProvider.getTrendingTitles?.({ limit: 12 }) ?? []
      : Promise.resolve([]),
    tvmazeCatalogProvider.getTrendingTitles?.({ limit: 12 }) ?? [],
    anilistCatalogProvider.getTrendingTitles?.({ limit: 12 }) ?? [],
  ]);

  return mergeDuplicateResults([...tmdbTrending, ...tvmazeTrending, ...anilistTrending]).slice(0, 16);
}

async function loadPopularMoviesRail(): Promise<MetadataSearchResult[]> {
  const [tmdbMovies, tvmazeMovies, anilistMovies] = await Promise.all([
    tmdbCatalogProvider.isConfigured()
      ? tmdbCatalogProvider.getPopularMovies?.({ limit: 12 }) ?? []
      : Promise.resolve([]),
    tvmazeCatalogProvider.getPopularMovies?.({ limit: 8 }) ?? [],
    anilistCatalogProvider.getPopularMovies?.({ limit: 8 }) ?? [],
  ]);
  return mergeDuplicateResults([...tmdbMovies, ...tvmazeMovies, ...anilistMovies]).slice(0, 12);
}

async function loadPopularSeriesRail(): Promise<MetadataSearchResult[]> {
  const [tmdbSeries, tvmazeSeries, anilistSeries] = await Promise.all([
    tmdbCatalogProvider.isConfigured()
      ? tmdbCatalogProvider.getPopularSeries?.({ limit: 12 }) ?? []
      : Promise.resolve([]),
    tvmazeCatalogProvider.getPopularSeries?.({ limit: 12 }) ?? [],
    anilistCatalogProvider.getPopularSeries?.({ limit: 8 }) ?? [],
  ]);
  return mergeDuplicateResults([...tmdbSeries, ...tvmazeSeries, ...anilistSeries]).slice(0, 12);
}

export async function buildOnlineDiscoverSections(): Promise<DiscoverCatalogSection[]> {
  const cfg = readOnlineCatalogSettings();
  if (!cfg.enabled || !cfg.discoverRailsEnabled) return [];

  const gatewayAvailable = getGatewayAvailability() === 'available';
  const tmdbConfigured = tmdbCatalogProvider.isConfigured();

  const [trending, popularAnime, popularMovies, popularSeries, genrePool] = await Promise.all([
    safeRail(() => loadTrendingRail(), 'discover:trending'),
    safeRail(
      () => anilistCatalogProvider.getPopularTitles?.({ limit: 14 }) ?? Promise.resolve([]),
      'discover:popular-anime'
    ),
    safeRail(() => loadPopularMoviesRail(), 'discover:popular-movies'),
    safeRail(() => loadPopularSeriesRail(), 'discover:popular-series'),
    fetchGenrePool(),
  ]);

  const genreSections = buildGenreSections(genrePool);

  const sections: DiscoverCatalogSection[] = [];

  if (trending.length > 0) {
    sections.push({
      id: 'trending',
      titleKey: 'discover.section.trending',
      subtitleKey: 'discover.section.trendingSubtitle',
      source: gatewayAvailable ? 'gateway' : tmdbConfigured ? 'tmdb' : 'mixed',
      layout: 'rail',
      items: trending,
    });
  }

  sections.push(...genreSections);

  if (popularMovies.length > 0) {
    sections.push({
      id: 'popular-movies',
      titleKey: 'discover.section.popularMovies',
      subtitleKey: 'discover.section.popularMoviesSubtitle',
      source: tmdbConfigured ? 'tmdb' : 'mixed',
      layout: 'rail',
      items: popularMovies,
    });
  }

  if (popularSeries.length > 0) {
    sections.push({
      id: 'popular-series',
      titleKey: 'discover.section.popularSeries',
      subtitleKey: 'discover.section.popularSeriesSubtitle',
      source: tmdbConfigured ? 'tmdb' : 'mixed',
      layout: 'rail',
      items: popularSeries,
    });
  }

  if (popularAnime.length > 0) {
    sections.push({
      id: 'popular-anime',
      titleKey: 'discover.section.popularAnime',
      subtitleKey: 'discover.section.popularAnimeSubtitle',
      source: 'anilist',
      layout: 'rail',
      items: popularAnime,
    });
  }

  return sections;
}

function genreFromSectionId(sectionId: string): string | undefined {
  if (!sectionId.startsWith('genre-')) return undefined;
  const slug = sectionId.slice('genre-'.length);
  return DISCOVER_GENRES.find((genre) => genreSlug(genre) === slug);
}

async function loadRailPage(
  loader: (options?: { limit?: number; page?: number }) => Promise<MetadataSearchResult[]>,
  page: number,
  limit: number
): Promise<MetadataSearchResult[]> {
  const fetchCount = Math.max(limit, (page + 1) * limit);
  const merged = await loader({ limit: fetchCount, page: page + 1 });
  const start = page * limit;
  return merged.slice(start, start + limit);
}

export async function fetchDiscoverSectionPage(
  sectionId: string,
  page: number,
  limit = 12
): Promise<MetadataSearchResult[]> {
  const cacheKey = `discover:${sectionId}:page:${page}`;
  const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
  if (cached) return cached;

  const cfg = readOnlineCatalogSettings();
  if (!cfg.enabled || !cfg.discoverRailsEnabled) {
    return [];
  }

  let items: MetadataSearchResult[] = [];

  const genre = genreFromSectionId(sectionId);
  if (genre) {
    const pool = await fetchGenrePool();
    const filtered = sortResultsByPopularity(
      pool.filter((item) => itemMatchesGenre(item, genre))
    );
    const start = page * limit;
    items = filtered.slice(start, start + limit);
  } else if (sectionId === 'trending') {
    if (getGatewayAvailability() === 'available' && prismMetadataGatewayProvider.isConfigured()) {
      const fromGateway = await prismMetadataGatewayProvider.getTrendingTitles?.({
        limit: (page + 1) * limit,
        page: page + 1,
      }) ?? [];
      items = fromGateway.slice(page * limit, page * limit + limit);
    }
    if (items.length === 0) {
      items = await loadRailPage(
        async (options) => {
          const [tmdbTrending, tvmazeTrending, anilistTrending] = await Promise.all([
            tmdbCatalogProvider.isConfigured()
              ? tmdbCatalogProvider.getTrendingTitles?.(options) ?? []
              : Promise.resolve([]),
            tvmazeCatalogProvider.getTrendingTitles?.(options) ?? [],
            anilistCatalogProvider.getTrendingTitles?.(options) ?? [],
          ]);
          return mergeDuplicateResults([...tmdbTrending, ...tvmazeTrending, ...anilistTrending]);
        },
        page,
        limit
      );
    }
  } else if (sectionId === 'popular-movies') {
    items = await loadRailPage(
      async (options) => {
        const [tmdbMovies, tvmazeMovies, anilistMovies] = await Promise.all([
          tmdbCatalogProvider.isConfigured()
            ? tmdbCatalogProvider.getPopularMovies?.(options) ?? []
            : Promise.resolve([]),
          tvmazeCatalogProvider.getPopularMovies?.(options) ?? [],
          anilistCatalogProvider.getPopularMovies?.(options) ?? [],
        ]);
        return mergeDuplicateResults([...tmdbMovies, ...tvmazeMovies, ...anilistMovies]);
      },
      page,
      limit
    );
  } else if (sectionId === 'popular-series') {
    items = await loadRailPage(
      async (options) => {
        const [tmdbSeries, tvmazeSeries, anilistSeries] = await Promise.all([
          tmdbCatalogProvider.isConfigured()
            ? tmdbCatalogProvider.getPopularSeries?.(options) ?? []
            : Promise.resolve([]),
          tvmazeCatalogProvider.getPopularSeries?.(options) ?? [],
          anilistCatalogProvider.getPopularSeries?.(options) ?? [],
        ]);
        return mergeDuplicateResults([...tmdbSeries, ...tvmazeSeries, ...anilistSeries]);
      },
      page,
      limit
    );
  } else if (sectionId === 'popular-anime') {
    items = await loadRailPage(
      (options) => anilistCatalogProvider.getPopularTitles?.(options) ?? Promise.resolve([]),
      page,
      limit
    );
  }

  metadataCacheSet(cacheKey, items, METADATA_CACHE_TTL.discoverRails);
  return items;
}
