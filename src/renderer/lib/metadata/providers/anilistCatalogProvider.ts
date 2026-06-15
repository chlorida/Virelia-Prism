import type { CatalogMediaType, CatalogTitle, MetadataSearchResult } from '../types';
import { formatCatalogRef } from '../catalogRef';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from '../metadataCache';
import { readOnlineCatalogSettings } from '../metadataSettings';
import { anilistProvider } from '../../mediaIntelligence/metadata/providers/anilistProvider';
import type { EnrichedTitleMetadata } from '../../../../shared/titleMetadataTypes';
import type { MetadataProvider, MetadataSearchOptions } from '../metadataProvider';

function mapAniListFormat(format?: string): CatalogMediaType {
  if (format === 'MOVIE') return 'movie';
  if (format === 'TV' || format === 'TV_SHORT') return 'series';
  if (format === 'OVA') return 'ova';
  if (format === 'SPECIAL' || format === 'ONA') return 'special';
  return 'anime';
}

function pickTitle(title?: { english?: string; romaji?: string; native?: string }): {
  title: string;
  originalTitle?: string;
  romanizedTitle?: string;
} {
  const english = title?.english?.trim();
  const romaji = title?.romaji?.trim();
  const native = title?.native?.trim();
  return {
    title: english || romaji || native || 'Unknown',
    originalTitle: native && native !== english ? native : undefined,
    romanizedTitle: romaji,
  };
}

function toSearchResult(media: {
  id: number;
  format?: string;
  seasonYear?: number;
  title?: { english?: string; romaji?: string; native?: string };
  coverImage?: { large?: string };
  description?: string;
  averageScore?: number;
  popularity?: number;
  genres?: string[];
  isAdult?: boolean;
}, confidence = 0.8): MetadataSearchResult {
  const names = pickTitle(media.title);
  const providerId = String(media.id);
  return {
    catalogId: formatCatalogRef('anilist', providerId),
    provider: 'anilist',
    providerId,
    title: names.title,
    originalTitle: names.originalTitle ?? names.romanizedTitle,
    year: media.seasonYear,
    type: mapAniListFormat(media.format),
    posterUrl: media.coverImage?.large,
    overview: media.description?.replace(/<[^>]+>/g, '').slice(0, 280),
    genres: media.genres ?? [],
    formatKind: media.format,
    popularity: media.popularity,
    isAdult: media.isAdult,
    confidence,
    source: 'anilist',
  };
}

async function anilistGraphql<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const json = await response.json() as { data?: T; errors?: unknown[] };
  if (json.errors?.length) throw new Error('AniList GraphQL error');
  if (!json.data) throw new Error('AniList empty response');
  return json.data;
}

interface AniListMedia {
  id: number;
  siteUrl?: string;
  format?: string;
  status?: string;
  episodes?: number;
  duration?: number;
  seasonYear?: number;
  averageScore?: number;
  popularity?: number;
  isAdult?: boolean;
  genres?: string[];
  description?: string;
  title?: { english?: string; romaji?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string };
  bannerImage?: string;
  studios?: { nodes?: Array<{ name?: string }> };
  relations?: {
    edges?: Array<{
      relationType?: string;
      node?: {
        id?: number;
        format?: string;
        seasonYear?: number;
        title?: { english?: string; romaji?: string; native?: string };
        coverImage?: { large?: string };
      };
    }>;
  };
}

function toCatalogTitle(media: AniListMedia): CatalogTitle {
  const names = pickTitle(media.title);
  const providerId = String(media.id);
  return {
    catalogId: formatCatalogRef('anilist', providerId),
    provider: 'anilist',
    providerId,
    title: names.title,
    originalTitle: names.originalTitle,
    romanizedTitle: names.romanizedTitle,
    year: media.seasonYear,
    type: mapAniListFormat(media.format),
    synopsis: media.description?.replace(/<[^>]+>/g, ''),
    episodeCount: media.episodes ?? undefined,
    genres: media.genres ?? [],
    rating: media.averageScore ?? undefined,
    ratingScale: 100,
    posterUrl: media.coverImage?.extraLarge ?? media.coverImage?.large,
    backdropUrl: media.bannerImage,
    studios: (media.studios?.nodes ?? []).map((n) => n.name).filter(Boolean) as string[],
    countries: [],
    languages: [],
    contentWarnings: [],
    source: 'anilist',
    sourceUrl: media.siteUrl ?? `https://anilist.co/anime/${media.id}`,
    fetchedAt: new Date().toISOString(),
  };
}

const MEDIA_FIELDS = `
  id siteUrl format status episodes duration seasonYear averageScore popularity isAdult genres description
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  studios { nodes { name } }
`;

export const anilistCatalogProvider: MetadataProvider = {
  id: 'anilist',
  displayName: 'AniList',
  isConfigured() {
    return true;
  },
  async searchTitles(query, options) {
    const limit = options?.limit ?? 20;
    const cacheKey = `anilist:search:${query.toLowerCase()}:${limit}`;
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    try {
      const data = await anilistGraphql<{ Page: { media: AniListMedia[] } }>(
        `query ($search: String, $perPage: Int, $isAdult: Boolean) {
          Page(page: 1, perPage: $perPage) {
            media(search: $search, type: ANIME, isAdult: $isAdult, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
          }
        }`,
        {
          search: query,
          perPage: limit,
          isAdult: options?.includeAdult ?? false,
        },
        options?.signal
      );
      const results = (data.Page.media ?? [])
        .map((m) => toSearchResult(m))
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
    const cacheKey = `anilist:title:${providerId}`;
    const cached = metadataCacheGet<CatalogTitle>(cacheKey);
    if (cached) return cached;
    const numericId = Number.parseInt(providerId, 10);
    if (!Number.isFinite(numericId)) return null;
    const enriched = await anilistProvider.getDetails(providerId, 'en', 1) as EnrichedTitleMetadata | null;
    if (enriched) {
      const title = toCatalogTitle({
        id: numericId,
        siteUrl: enriched.externalUrl,
        format: enriched.format ?? (enriched.type === 'movie' ? 'MOVIE' : 'TV'),
        seasonYear: enriched.year,
        episodes: enriched.episodeCount,
        duration: enriched.duration,
        averageScore: enriched.rating,
        genres: enriched.genres,
        description: enriched.description,
        title: {
          english: enriched.englishTitle ?? enriched.localizedTitle ?? enriched.canonicalTitle,
          romaji: enriched.romajiTitle ?? enriched.canonicalTitle,
          native: enriched.originalTitle,
        },
        coverImage: { large: enriched.posterUrl, extraLarge: enriched.posterUrl },
        bannerImage: enriched.backdropUrl ?? enriched.bannerUrl,
        studios: { nodes: (enriched.studios ?? []).map((name: string) => ({ name })) },
      });
      metadataCacheSet(cacheKey, title, METADATA_CACHE_TTL.titleDetails);
      return title;
    }
    const data = await anilistGraphql<{ Media: AniListMedia | null }>(
      `query ($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} relations { edges { relationType node { id format seasonYear title { romaji english native } coverImage { large } } } } } }`,
      { id: numericId },
      options?.signal
    );
    if (!data.Media) return null;
    const title = toCatalogTitle(data.Media);
    metadataCacheSet(cacheKey, title, METADATA_CACHE_TTL.titleDetails);
    return title;
  },
  async getTrendingTitles(options) {
    const cacheKey = 'anilist:trending';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await anilistGraphql<{ Page: { media: AniListMedia[] } }>(
      `query ($perPage: Int) { Page(page: 1, perPage: $perPage) { media(sort: TRENDING_DESC, type: ANIME) { ${MEDIA_FIELDS} } } }`,
      { perPage: options?.limit ?? 16 },
      options?.signal
    );
    const results = (data.Page.media ?? []).map((m) => toSearchResult(m, 0.75));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
    return results;
  },
  async getPopularTitles(options) {
    const cacheKey = 'anilist:popular';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await anilistGraphql<{ Page: { media: AniListMedia[] } }>(
      `query ($perPage: Int) { Page(page: 1, perPage: $perPage) { media(sort: POPULARITY_DESC, type: ANIME) { ${MEDIA_FIELDS} } } }`,
      { perPage: options?.limit ?? 16 },
      options?.signal
    );
    const results = (data.Page.media ?? []).map((m) => toSearchResult(m, 0.7));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
    return results;
  },
  async getPopularMovies(options) {
    const cacheKey = 'anilist:popular-movies';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await anilistGraphql<{ Page: { media: AniListMedia[] } }>(
      `query ($perPage: Int) { Page(page: 1, perPage: $perPage) { media(sort: POPULARITY_DESC, type: ANIME, format: MOVIE) { ${MEDIA_FIELDS} } } }`,
      { perPage: options?.limit ?? 12 },
      options?.signal
    );
    const results = (data.Page.media ?? []).map((m) => toSearchResult(m, 0.72));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
    return results;
  },
  async getPopularSeries(options) {
    const cacheKey = 'anilist:popular-series';
    const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
    if (cached) return cached;
    const data = await anilistGraphql<{ Page: { media: AniListMedia[] } }>(
      `query ($perPage: Int) { Page(page: 1, perPage: $perPage) { media(sort: POPULARITY_DESC, type: ANIME, format_in: [TV, TV_SHORT]) { ${MEDIA_FIELDS} } } }`,
      { perPage: options?.limit ?? 12 },
      options?.signal
    );
    const results = (data.Page.media ?? []).map((m) => toSearchResult(m, 0.72));
    metadataCacheSet(cacheKey, results, METADATA_CACHE_TTL.discoverRails);
    return results;
  },
  async getRelatedTitles(providerId, options) {
    const numericId = Number.parseInt(providerId, 10);
    if (!Number.isFinite(numericId)) return [];
    const data = await anilistGraphql<{ Media: AniListMedia | null }>(
      `query ($id: Int) { Media(id: $id) { relations { edges { relationType node { id format seasonYear title { romaji english native } coverImage { large } } } } } }`,
      { id: numericId },
      options?.signal
    );
    return (data.Media?.relations?.edges ?? [])
      .map((edge) => edge.node)
      .filter((node): node is NonNullable<typeof node> & { id: number } => Boolean(node?.id))
      .map((node) => toSearchResult(node as AniListMedia, 0.65));
  },
  async searchPeople(query, options) {
    const data = await anilistGraphql<{ Page: { staff: Array<{ id: number; name?: { full?: string }; image?: { large?: string } }> } }>(
      `query ($search: String, $perPage: Int) { Page(page: 1, perPage: $perPage) { staff(search: $search) { id name { full } image { large } } } }`,
      { search: query, perPage: options?.limit ?? 12 },
      options?.signal
    );
    return (data.Page.staff ?? []).map((person) => ({
      personId: formatCatalogRef('anilist', `person-${person.id}`),
      name: person.name?.full ?? 'Unknown',
      photoUrl: person.image?.large,
      knownFor: [],
    }));
  },
};
