import type {
  CatalogEpisode,
  CatalogPerson,
  CatalogSeason,
  CatalogTitle,
  CatalogMediaType,
  MetadataSearchResult,
} from './types';

export interface MetadataSearchOptions {
  limit?: number;
  type?: CatalogMediaType;
  year?: number;
  page?: number;
  signal?: AbortSignal;
  includeAdult?: boolean;
}

export interface MetadataProvider {
  id: string;
  displayName: string;
  isConfigured(): boolean;
  searchTitles(query: string, options?: MetadataSearchOptions): Promise<MetadataSearchResult[]>;
  getTitleDetails(providerId: string, options?: { signal?: AbortSignal }): Promise<CatalogTitle | null>;
  getSeasonDetails?(providerId: string, seasonNumber: number, options?: { signal?: AbortSignal }): Promise<CatalogSeason | null>;
  getEpisodeDetails?(
    providerId: string,
    seasonNumber: number,
    episodeNumber: number,
    options?: { signal?: AbortSignal }
  ): Promise<CatalogEpisode | null>;
  searchPeople?(query: string, options?: MetadataSearchOptions): Promise<CatalogPerson[]>;
  getPersonDetails?(providerId: string, options?: { signal?: AbortSignal }): Promise<CatalogPerson | null>;
  getPopularTitles?(options?: MetadataSearchOptions): Promise<MetadataSearchResult[]>;
  getPopularMovies?(options?: MetadataSearchOptions): Promise<MetadataSearchResult[]>;
  getPopularSeries?(options?: MetadataSearchOptions): Promise<MetadataSearchResult[]>;
  getTrendingTitles?(options?: MetadataSearchOptions): Promise<MetadataSearchResult[]>;
  getSimilarTitles?(providerId: string, options?: MetadataSearchOptions): Promise<MetadataSearchResult[]>;
  getRelatedTitles?(providerId: string, options?: { signal?: AbortSignal }): Promise<MetadataSearchResult[]>;
  getFranchiseDetails?(franchiseId: string): Promise<CatalogTitle[]>;
  getImages?(providerId: string): Promise<{ posterUrl?: string; backdropUrl?: string }>;
}

/** @deprecated Use displayName */
export type MetadataProviderLegacy = MetadataProvider & { label?: string };

export interface WatchOptionsProvider {
  id: string;
  getWatchOptions(catalogId: string, region: string): Promise<import('./types').WatchOption[]>;
}

export interface ReviewProvider {
  id: string;
  getReviewSummary(catalogId: string): Promise<import('./types').ReviewSummary | null>;
  getReviews(
    catalogId: string,
    options?: { limit?: number; criticsOnly?: boolean }
  ): Promise<import('./types').ReviewItem[]>;
}
