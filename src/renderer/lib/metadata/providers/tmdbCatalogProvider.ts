import type { CatalogMediaType, CatalogTitle, MetadataSearchResult } from '../types';
import { formatCatalogRef } from '../catalogRef';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from '../metadataCache';
import { getSettingsSnapshot } from '../../../features/settings/settingsStore';
import type { MetadataProvider, MetadataSearchOptions } from '../metadataProvider';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w780';

interface TmdbSearchItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  popularity?: number;
}

function getApiKey(): string {
  return String(getSettingsSnapshot().discovery?.tmdbApiKey ?? '').trim();
}

function mapMediaType(item: TmdbSearchItem): CatalogMediaType {
  if (item.media_type === 'movie') return 'movie';
  if (item.media_type === 'tv') return 'series';
  return 'movie';
}

function yearFromItem(item: TmdbSearchItem): number | undefined {
  const raw = item.release_date || item.first_air_date;
  if (!raw) return undefined;
  const year = Number.parseInt(raw.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

function toSearchResult(item: TmdbSearchItem, confidence = 0.82): MetadataSearchResult {
  const mediaType = item.media_type ?? 'movie';
  const providerId = `${mediaType}:${item.id}`;
  const title = item.title || item.name || 'Unknown';
  return {
    catalogId: formatCatalogRef('tmdb', providerId),
    provider: 'tmdb',
    providerId,
    title,
    originalTitle: item.original_title || item.original_name,
    year: yearFromItem(item),
    type: mapMediaType(item),
    posterUrl: item.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : undefined,
    overview: item.overview?.slice(0, 280),
    confidence,
    source: 'tmdb',
  };
}

async function tmdbFetch<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('TMDB API key not configured');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), { signal });
  if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function parseProviderId(providerId: string): { mediaType: 'movie' | 'tv'; id: string } {
  if (providerId.includes(':')) {
    const [mediaType, id] = providerId.split(':');
    return { mediaType: mediaType === 'tv' ? 'tv' : 'movie', id };
  }
  return { mediaType: 'movie', id: providerId };
}

export const tmdbCatalogProvider: MetadataProvider = {
  id: 'tmdb',
  displayName: 'TMDb',
  isConfigured() {
    return getApiKey().length > 0;
  },
  async searchTitles(query, options) {
    const limit = options?.limit ?? 20;
    const cacheKey = `tmdb:search:${query.toLowerCase()}:${limit}`;
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await tmdbFetch<{ results: TmdbSearchItem[] }>(
      '/search/multi',
      { query, include_adult: options?.includeAdult ? 'true' : 'false', page: String(options?.page ?? 1) },
      options?.signal
    );
    const results = (data.results ?? [])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .slice(0, limit)
      .map((item) => toSearchResult(item));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.searchResults);
    return results;
  },
  async getTitleDetails(providerId, options) {
    const cacheKey = `tmdb:title:${providerId}`;
    const cached = metadataCacheGet<CatalogTitle>(cacheKey);
    if (cached) return cached;
    const { mediaType, id } = parseProviderId(providerId);
    const data = await tmdbFetch<{
      id: number;
      title?: string;
      name?: string;
      original_title?: string;
      original_name?: string;
      overview?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      backdrop_path?: string | null;
      runtime?: number;
      episode_run_time?: number[];
      number_of_episodes?: number;
      number_of_seasons?: number;
      genres?: Array<{ name?: string }>;
      vote_average?: number;
      homepage?: string;
    }>(`/${mediaType}/${id}`, { language: 'en-US' }, options?.signal);

    const title: CatalogTitle = {
      catalogId: formatCatalogRef('tmdb', `${mediaType}:${id}`),
      provider: 'tmdb',
      providerId: `${mediaType}:${id}`,
      title: data.title || data.name || 'Unknown',
      originalTitle: data.original_title || data.original_name,
      year: yearFromItem(data as TmdbSearchItem),
      type: mediaType === 'tv' ? 'series' : 'movie',
      synopsis: data.overview,
      runtimeMinutes: data.runtime ?? data.episode_run_time?.[0],
      episodeCount: data.number_of_episodes,
      seasonCount: data.number_of_seasons,
      genres: (data.genres ?? []).map((g) => g.name).filter(Boolean) as string[],
      rating: data.vote_average,
      ratingScale: 10,
      posterUrl: data.poster_path ? `${TMDB_IMAGE}${data.poster_path}` : undefined,
      backdropUrl: data.backdrop_path ? `${TMDB_BACKDROP}${data.backdrop_path}` : undefined,
      studios: [],
      countries: [],
      languages: [],
      contentWarnings: [],
      source: 'tmdb',
      sourceUrl: data.homepage,
      fetchedAt: new Date().toISOString(),
    };
    metadataCacheSet(cacheKey, title, METADATA_CACHE_TTL.titleDetails);
    return title;
  },
  async getTrendingTitles(options) {
    const cacheKey = 'tmdb:trending';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await tmdbFetch<{ results: TmdbSearchItem[] }>(
      '/trending/all/week',
      { page: '1' },
      options?.signal
    );
    const results = (data.results ?? [])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .slice(0, options?.limit ?? 16)
      .map((item) => toSearchResult(item, 0.78));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
    return results;
  },
  async getPopularTitles(options) {
    const cacheKey = 'tmdb:popular';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const [movies, series] = await Promise.all([
      tmdbFetch<{ results: TmdbSearchItem[] }>('/movie/popular', { page: '1' }, options?.signal),
      tmdbFetch<{ results: TmdbSearchItem[] }>('/tv/popular', { page: '1' }, options?.signal),
    ]);
    const merged = [...(movies.results ?? []), ...(series.results ?? [])]
      .map((item) => ({ ...item, media_type: item.media_type ?? (item.title ? 'movie' : 'tv') }))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, options?.limit ?? 16)
      .map((item) => toSearchResult(item, 0.72));
    metadataCacheSet(cacheKey, merged, METADATA_CACHE_TTL.discoverRails);
    return merged;
  },
  async getPopularMovies(options) {
    const cacheKey = 'tmdb:popular-movies';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await tmdbFetch<{ results: TmdbSearchItem[] }>(
      '/movie/popular',
      { page: '1' },
      options?.signal
    );
    const results = (data.results ?? [])
      .slice(0, options?.limit ?? 12)
      .map((item) => toSearchResult({ ...item, media_type: 'movie' }, 0.74));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
    return results;
  },
  async getPopularSeries(options) {
    const cacheKey = 'tmdb:popular-series';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await tmdbFetch<{ results: TmdbSearchItem[] }>(
      '/tv/popular',
      { page: '1' },
      options?.signal
    );
    const results = (data.results ?? [])
      .slice(0, options?.limit ?? 12)
      .map((item) => toSearchResult({ ...item, media_type: 'tv' }, 0.74));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
    return results;
  },
  async getSimilarTitles(providerId, options) {
    const { mediaType, id } = parseProviderId(providerId);
    const data = await tmdbFetch<{ results: TmdbSearchItem[] }>(
      `/${mediaType}/${id}/similar`,
      { page: '1' },
      options?.signal
    );
    return (data.results ?? [])
      .slice(0, options?.limit ?? 12)
      .map((item) => toSearchResult({ ...item, media_type: mediaType }, 0.68));
  },
  async searchPeople(query, options) {
    const data = await tmdbFetch<{ results: Array<{ id: number; name: string; profile_path?: string | null; known_for?: Array<{ title?: string; name?: string }> }> }>(
      '/search/person',
      { query, page: '1' },
      options?.signal
    );
    return (data.results ?? []).slice(0, options?.limit ?? 12).map((person) => ({
      personId: formatCatalogRef('tmdb', `person:${person.id}`),
      name: person.name,
      photoUrl: person.profile_path ? `${TMDB_IMAGE}${person.profile_path}` : undefined,
      knownFor: (person.known_for ?? []).map((item) => item.title || item.name).filter(Boolean) as string[],
    }));
  },
};
