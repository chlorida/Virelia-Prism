import type { CatalogMediaType, CatalogTitle, MetadataSearchResult } from '../types';
import { formatCatalogRef } from '../catalogRef';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from '../metadataCache';
import type { MetadataProvider, MetadataSearchOptions } from '../metadataProvider';

const TVMAZE_BASE = 'https://api.tvmaze.com';

interface TvmazeShow {
  id: number;
  name: string;
  type?: string;
  language?: string;
  premiered?: string;
  ended?: string;
  summary?: string;
  weight?: number;
  image?: { medium?: string; original?: string };
  genres?: string[];
  rating?: { average?: number };
  url?: string;
  externals?: { imdb?: string; thetvdb?: number };
  network?: { name?: string; country?: { name?: string } };
  webChannel?: { name?: string };
}

interface TvmazeSearchHit {
  score: number;
  show: TvmazeShow;
}

interface TvmazeEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  summary?: string;
  airdate?: string;
  image?: { medium?: string };
}

function stripHtml(html?: string): string | undefined {
  return html?.replace(/<[^>]+>/g, '').trim();
}

function yearFromDate(raw?: string): number | undefined {
  if (!raw) return undefined;
  const year = Number.parseInt(raw.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

function mapShowType(show: TvmazeShow): CatalogMediaType {
  if (show.type === 'Animation') return 'anime';
  if (show.type === 'Documentary') return 'special';
  return 'series';
}

function posterFromShow(show: TvmazeShow): string | undefined {
  return show.image?.medium ?? show.image?.original;
}

function toSearchResult(hit: TvmazeSearchHit | { show: TvmazeShow; score?: number }, confidence?: number): MetadataSearchResult {
  const show = hit.show;
  const score = 'score' in hit && typeof hit.score === 'number' ? hit.score : 0.7;
  return {
    catalogId: formatCatalogRef('tvmaze', String(show.id)),
    provider: 'tvmaze',
    providerId: String(show.id),
    title: show.name,
    year: yearFromDate(show.premiered),
    type: mapShowType(show),
    posterUrl: posterFromShow(show),
    overview: stripHtml(show.summary)?.slice(0, 280),
    genres: show.genres ?? [],
    formatKind: show.type,
    popularity: show.weight ?? Math.round(score * 100),
    confidence: confidence ?? Math.min(0.92, 0.55 + score * 0.35),
    source: 'tvmaze',
  };
}

async function tvmazeFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${TVMAZE_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`TVMaze HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function isWesternScripted(show: TvmazeShow): boolean {
  return show.type === 'Scripted' || show.type === 'Documentary' || show.type === 'Reality';
}

export const tvmazeCatalogProvider: MetadataProvider = {
  id: 'tvmaze',
  displayName: 'TVMaze',
  isConfigured() {
    return true;
  },
  async searchTitles(query, options) {
    const limit = options?.limit ?? 20;
    const cacheKey = `tvmaze:search:${query.toLowerCase()}:${limit}`;
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const encoded = encodeURIComponent(query.trim());
      const data = await tvmazeFetch<TvmazeSearchHit[]>(
        `/search/shows?q=${encoded}`,
        options?.signal
      );
      const results = (data ?? [])
        .slice(0, limit)
        .map((hit) => toSearchResult(hit))
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      metadataCacheSet(
        cacheKey,
        results,
        results.length === 0 ? METADATA_CACHE_TTL.searchEmptyResults : METADATA_CACHE_TTL.searchResults
      );
      return results;
    } catch {
      return [];
    }
  },
  async getTitleDetails(providerId, options) {
    const cacheKey = `tvmaze:title:${providerId}`;
    const cached = metadataCacheGet<CatalogTitle>(cacheKey);
    if (cached) return cached;

    try {
      const data = await tvmazeFetch<TvmazeShow & { _embedded?: { episodes?: TvmazeEpisode[] } }>(
        `/shows/${providerId}?embed[]=episodes`,
        options?.signal
      );
      const episodes = data._embedded?.episodes ?? [];
      const title: CatalogTitle = {
        catalogId: formatCatalogRef('tvmaze', providerId),
        provider: 'tvmaze',
        providerId,
        title: data.name,
        year: yearFromDate(data.premiered),
        type: mapShowType(data),
        synopsis: stripHtml(data.summary),
        episodeCount: episodes.length > 0 ? episodes.length : undefined,
        genres: data.genres ?? [],
        rating: data.rating?.average,
        ratingScale: 10,
        posterUrl: posterFromShow(data),
        studios: [data.network?.name, data.webChannel?.name].filter(Boolean) as string[],
        countries: [data.network?.country?.name].filter(Boolean) as string[],
        languages: data.language ? [data.language] : [],
        contentWarnings: [],
        source: 'tvmaze',
        sourceUrl: data.url,
        fetchedAt: new Date().toISOString(),
      };
      metadataCacheSet(cacheKey, title, METADATA_CACHE_TTL.titleDetails);
      return title;
    } catch {
      return null;
    }
  },
  async getTrendingTitles(options) {
    const cacheKey = 'tvmaze:trending';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const schedule = await tvmazeFetch<Array<{ show: TvmazeShow; score?: number }>>(
        `/schedule?country=US&date=${today}`,
        options?.signal
      );
      const seen = new Set<number>();
      const results: MetadataSearchResult[] = [];
      for (const entry of schedule ?? []) {
        if (!entry.show?.id || seen.has(entry.show.id)) continue;
        seen.add(entry.show.id);
        results.push(toSearchResult({ show: entry.show, score: 0.8 }, 0.76));
        if (results.length >= (options?.limit ?? 16)) break;
      }
      metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
      return results;
    } catch {
      return [];
    }
  },
  async getPopularSeries(options) {
    const cacheKey = 'tvmaze:popular-series';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const pages = await Promise.all([
        tvmazeFetch<TvmazeShow[]>('/shows?page=1', options?.signal),
        tvmazeFetch<TvmazeShow[]>('/shows?page=2', options?.signal),
      ]);
      const results = pages
        .flat()
        .filter((show) => isWesternScripted(show))
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .slice(0, options?.limit ?? 12)
        .map((show) => toSearchResult({ show, score: 0.75 }, 0.74));
      metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
      return results;
    } catch {
      return [];
    }
  },
  async getPopularMovies(options) {
    const cacheKey = 'tvmaze:popular-movies';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const pages = await Promise.all([
        tvmazeFetch<TvmazeShow[]>('/shows?page=3', options?.signal),
        tvmazeFetch<TvmazeShow[]>('/shows?page=4', options?.signal),
      ]);
      const results = pages
        .flat()
        .filter((show) => show.type === 'Documentary')
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .slice(0, options?.limit ?? 12)
        .map((show) => toSearchResult({ show, score: 0.7 }, 0.7));
      metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
      return results;
    } catch {
      return [];
    }
  },
};
