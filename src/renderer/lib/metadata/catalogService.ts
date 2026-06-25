import type { FranchiseCatalogTitle } from '../mediaIntelligence/franchise/franchiseCatalog';
import {
  FRANCHISE_CATALOG,
  getFranchiseCatalogEntry,
} from '../mediaIntelligence/franchise/franchiseCatalog';
import type { LibraryTitle } from '../mediaIntelligence/types';
import { matchCatalogTitleToLibrary } from '../mediaIntelligence/franchise/franchiseMatcher';
import type {
  CatalogEpisode,
  CatalogMediaType,
  CatalogSeason,
  CatalogTitle,
  LocalAvailability,
  MetadataSearchResult,
} from './types';
import type { MetadataProvider } from './metadataProvider';

const TTL_MS = {
  title: 7 * 24 * 60 * 60 * 1000,
  watchOptions: 12 * 60 * 60 * 1000,
  reviews: 24 * 60 * 60 * 1000,
} as const;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearMetadataCache(): void {
  cache.clear();
}

function mapFranchiseType(type: FranchiseCatalogTitle['type']): CatalogMediaType {
  if (type === 'ova') return 'ova';
  if (type === 'special') return 'special';
  if (type === 'movie') return 'movie';
  return 'series';
}

export function franchiseTitleToCatalog(
  catalogTitle: FranchiseCatalogTitle,
  franchiseId?: string,
  franchiseName?: string
): CatalogTitle {
  const year = Number.parseInt(catalogTitle.releaseDate.slice(0, 4), 10);
  return {
    catalogId: catalogTitle.catalogTitleId,
    title: catalogTitle.displayTitle,
    year: Number.isFinite(year) ? year : undefined,
    type: mapFranchiseType(catalogTitle.type),
    synopsis: catalogTitle.description,
    releaseDate: catalogTitle.releaseDate,
    genres: [],
    studios: [],
    countries: [],
    languages: [],
    contentWarnings: [],
    posterUrl: catalogTitle.posterUrl,
    franchiseId,
    franchiseName,
    source: 'franchise-catalog',
    fetchedAt: new Date().toISOString(),
  };
}

export function getCatalogTitleByIdFromAnySource(catalogId: string): CatalogTitle | null {
  const cached = cacheGet<CatalogTitle>(`title:${catalogId}`);
  if (cached) return cached;

  for (const franchise of FRANCHISE_CATALOG) {
    const title = franchise.titles.find((t) => t.catalogTitleId === catalogId);
    if (title) {
      const catalog = franchiseTitleToCatalog(title, franchise.franchiseId, franchise.franchiseName);
      cacheSet(`title:${catalogId}`, catalog, TTL_MS.title);
      return catalog;
    }
  }
  return null;
}

export function resolveLocalAvailability(
  catalogId: string,
  libraryTitles: LibraryTitle[]
): { availability: LocalAvailability; localTitleId?: string; localTitle?: LibraryTitle } {
  for (const franchise of FRANCHISE_CATALOG) {
    const catalogTitle = franchise.titles.find((t) => t.catalogTitleId === catalogId);
    if (!catalogTitle) continue;
    const match = matchCatalogTitleToLibrary(catalogTitle, libraryTitles);
    if (match.localTitle) {
      return {
        availability: 'in_library',
        localTitleId: match.localTitle.id,
        localTitle: match.localTitle,
      };
    }
    const numeric = match.confidence ?? 0;
    if (numeric >= 0.45 && numeric < 0.72) {
      return { availability: 'metadata_only' };
    }
  }
  return { availability: 'not_in_library' };
}

export function searchCatalogTitles(query: string, limit = 20): MetadataSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const results: MetadataSearchResult[] = [];

  for (const franchise of FRANCHISE_CATALOG) {
    for (const title of franchise.titles) {
      const haystack = [
        title.displayTitle,
        ...title.aliases,
        franchise.franchiseName,
      ].join(' ').toLowerCase();
      if (!haystack.includes(normalized)) continue;
      results.push({
        catalogId: title.catalogTitleId,
        provider: 'franchise-catalog',
        providerId: title.catalogTitleId,
        title: title.displayTitle,
        year: Number.parseInt(title.releaseDate.slice(0, 4), 10) || undefined,
        type: mapFranchiseType(title.type),
        posterUrl: title.posterUrl,
        confidence: 0.9,
        source: 'franchise-catalog',
      });
    }
  }
  return results.slice(0, limit);
}

export function getCatalogSeasons(catalogId: string, localTitle?: LibraryTitle): CatalogSeason[] {
  const catalog = getCatalogTitleByIdFromAnySource(catalogId);
  if (!catalog || (catalog.type !== 'series' && catalog.type !== 'anime')) return [];

  const episodeCount = localTitle?.uniqueEpisodeCount ?? localTitle?.episodes?.length ?? 0;
  if (episodeCount <= 0) {
    return [{ catalogId, seasonNumber: 1, title: 'Season 1', episodeCount: 0 }];
  }

  const seasons = new Map<number, number>();
  for (const ep of localTitle?.episodes ?? []) {
    const sn = ep.seasonNumber ?? 1;
    seasons.set(sn, (seasons.get(sn) ?? 0) + 1);
  }
  if (seasons.size === 0) {
    return [{ catalogId, seasonNumber: 1, title: 'Season 1', episodeCount }];
  }
  return [...seasons.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seasonNumber, count]) => ({
      catalogId,
      seasonNumber,
      title: `Season ${seasonNumber}`,
      episodeCount: count,
    }));
}

export function getCatalogEpisodes(
  catalogId: string,
  seasonNumber: number,
  localTitle?: LibraryTitle
): CatalogEpisode[] {
  if (!localTitle?.episodes) return [];
  return localTitle.episodes
    .filter((ep) => (ep.seasonNumber ?? 1) === seasonNumber)
    .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
    .map((ep) => ({
      catalogId,
      seasonNumber,
      episodeNumber: ep.episodeNumber ?? 0,
      title: ep.displayTitle,
      runtimeMinutes: ep.durationSeconds ? Math.round(ep.durationSeconds / 60) : undefined,
      localMediaId: ep.versions[0]?.itemId,
    }));
}

export const franchiseCatalogProvider: MetadataProvider = {
  id: 'franchise-catalog',
  displayName: 'Franchise Catalog',
  isConfigured: () => true,
  async searchTitles(query, options) {
    return searchCatalogTitles(query, options?.limit ?? 20);
  },
  async getTitleDetails(catalogId) {
    return getCatalogTitleByIdFromAnySource(catalogId);
  },
  async getFranchiseDetails(franchiseId) {
    const franchise = getFranchiseCatalogEntry(franchiseId);
    if (!franchise) return [];
    return franchise.titles.map((t) =>
      franchiseTitleToCatalog(t, franchise.franchiseId, franchise.franchiseName)
    );
  },
  async getRelatedTitles(catalogId) {
    const catalog = getCatalogTitleByIdFromAnySource(catalogId);
    if (!catalog?.franchiseId) return [];
    const franchise = getFranchiseCatalogEntry(catalog.franchiseId);
    if (!franchise) return [];
    return franchise.titles
      .filter((t) => t.catalogTitleId !== catalogId)
      .map((t) => ({
        catalogId: t.catalogTitleId,
        provider: 'franchise-catalog',
        providerId: t.catalogTitleId,
        title: t.displayTitle,
        year: Number.parseInt(t.releaseDate.slice(0, 4), 10) || undefined,
        type: mapFranchiseType(t.type),
        posterUrl: t.posterUrl,
        confidence: 0.85,
        source: 'franchise-catalog',
      }));
  },
};
