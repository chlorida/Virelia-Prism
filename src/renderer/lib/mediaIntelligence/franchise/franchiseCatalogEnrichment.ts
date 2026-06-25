import type { EnrichedTitleMetadata, RelatedTitle } from '../../../../shared/titleMetadataTypes';
import type { CatalogTitle, MetadataSearchResult } from '../../metadata/types';
import { formatCatalogRef } from '../../metadata/catalogRef';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from '../../metadata/metadataCache';
import { anilistCatalogProvider } from '../../metadata/providers/anilistCatalogProvider';
import { anilistProvider } from '../metadata/providers/anilistProvider';
import { attachMediaSupplement } from '../metadata/titleMetadataService';
import { seedFranchiseArtworkPoster } from './franchiseArtworkService';
import {
  getCatalogTitleById,
  type FranchiseCatalogTitle,
} from './franchiseCatalog';

export interface FranchiseCatalogEnrichment {
  catalog: CatalogTitle;
  enriched?: EnrichedTitleMetadata;
  related: MetadataSearchResult[];
}

function franchiseSearchQueries(catalogTitle: FranchiseCatalogTitle): string[] {
  const queries = [
    catalogTitle.displayTitle,
    ...catalogTitle.aliases,
    catalogTitle.displayTitle.replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim(),
  ];
  return [...new Set(queries.map((value) => value.trim()).filter(Boolean))];
}

function scoreSearchResult(
  result: MetadataSearchResult,
  catalogTitle: FranchiseCatalogTitle
): number {
  const year = Number.parseInt(catalogTitle.releaseDate.slice(0, 4), 10);
  let score = result.confidence ?? 0.5;
  if (result.year && Number.isFinite(year) && result.year === year) score += 1.2;
  else if (result.year && Number.isFinite(year) && Math.abs(result.year - year) <= 1) score += 0.4;

  const target = catalogTitle.displayTitle.toLowerCase();
  const title = result.title.toLowerCase();
  if (title === target) score += 1.5;
  else if (title.includes(target) || target.includes(title)) score += 0.6;

  for (const alias of catalogTitle.aliases) {
    const aliasNorm = alias.toLowerCase();
    if (title.includes(aliasNorm) || aliasNorm.includes(title)) {
      score += 0.35;
      break;
    }
  }

  if (catalogTitle.type === 'movie' && result.type === 'movie') score += 0.2;
  if ((catalogTitle.type === 'series' || catalogTitle.type === 'ova')
    && (result.type === 'series' || result.type === 'anime' || result.type === 'ova')) {
    score += 0.15;
  }

  return score;
}

async function resolveAnilistSearchResult(
  catalogTitle: FranchiseCatalogTitle,
  signal?: AbortSignal
): Promise<MetadataSearchResult | undefined> {
  const queries = franchiseSearchQueries(catalogTitle);
  let best: { result: MetadataSearchResult; score: number } | undefined;

  for (const query of queries) {
    const results = await anilistCatalogProvider.searchTitles(query, { limit: 8, signal });
    for (const result of results) {
      const score = scoreSearchResult(result, catalogTitle);
      if (!best || score > best.score) {
        best = { result, score };
      }
    }
    if (best && best.score >= 2.2) break;
  }

  return best?.result;
}

function mapRelatedTitles(enriched?: EnrichedTitleMetadata): MetadataSearchResult[] {
  const related = enriched?.relatedTitles ?? [];
  return related.map((entry: RelatedTitle) => ({
    catalogId: entry.providerId != null
      ? formatCatalogRef(entry.provider, String(entry.providerId))
      : entry.id,
    provider: entry.provider,
    providerId: String(entry.providerId ?? entry.id),
    title: entry.englishTitle ?? entry.title,
    year: entry.year,
    type: 'anime',
    posterUrl: entry.coverImage?.url ?? entry.coverImage?.displayUrl,
    confidence: entry.confidence ?? 0.7,
    source: entry.provider,
  }));
}

function mergeCatalogWithEnriched(
  catalog: CatalogTitle,
  enriched: EnrichedTitleMetadata
): CatalogTitle {
  return {
    ...catalog,
    title: enriched.localizedTitle ?? enriched.canonicalTitle ?? catalog.title,
    originalTitle: enriched.originalTitle ?? catalog.originalTitle,
    romanizedTitle: enriched.romajiTitle ?? catalog.romanizedTitle,
    year: enriched.year ?? catalog.year,
    synopsis: enriched.description ?? enriched.shortDescription ?? catalog.synopsis,
    posterUrl: enriched.posterUrl ?? catalog.posterUrl,
    backdropUrl: enriched.backdropUrl ?? enriched.bannerUrl ?? catalog.backdropUrl,
    episodeCount: enriched.episodeCount ?? catalog.episodeCount,
    runtimeMinutes: enriched.duration ?? catalog.runtimeMinutes,
    genres: enriched.genres?.length ? enriched.genres : catalog.genres,
    studios: enriched.studios?.length ? enriched.studios : catalog.studios,
    rating: enriched.rating ?? catalog.rating,
    sourceUrl: enriched.externalUrl ?? catalog.sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function enrichFranchiseCatalogBundle(
  catalog: CatalogTitle,
  options?: { signal?: AbortSignal }
): Promise<FranchiseCatalogEnrichment> {
  const cacheKey = `franchise-enriched:${catalog.catalogId}`;
  const cached = metadataCacheGet<FranchiseCatalogEnrichment>(cacheKey);
  if (cached) return cached;

  const franchiseTitle = getCatalogTitleById(catalog.catalogId);
  if (!franchiseTitle) {
    return { catalog, related: [] };
  }

  let searchResult: MetadataSearchResult | undefined;
  if (franchiseTitle.anilistMediaId) {
    searchResult = {
      catalogId: formatCatalogRef('anilist', String(franchiseTitle.anilistMediaId)),
      provider: 'anilist',
      providerId: String(franchiseTitle.anilistMediaId),
      title: franchiseTitle.displayTitle,
      year: Number.parseInt(franchiseTitle.releaseDate.slice(0, 4), 10) || undefined,
      type: catalog.type,
      confidence: 1,
      source: 'anilist',
    };
  } else {
    searchResult = await resolveAnilistSearchResult(franchiseTitle, options?.signal);
  }

  if (!searchResult?.providerId) {
    if (!franchiseTitle.anilistMediaId) {
      const empty = { catalog, related: [] as MetadataSearchResult[] };
      metadataCacheSet(cacheKey, empty, METADATA_CACHE_TTL.searchEmptyResults);
      return empty;
    }
    return { catalog, related: [] };
  }

  let enriched = (await anilistProvider.getDetails(
    searchResult.providerId,
    'en',
    searchResult.confidence ?? 0.85
  )) as EnrichedTitleMetadata | null;

  if (enriched) {
    try {
      enriched = await attachMediaSupplement(enriched);
    } catch {
      // keep base metadata
    }
  }

  const mergedCatalog = enriched ? mergeCatalogWithEnriched(catalog, enriched) : catalog;
  if (mergedCatalog.posterUrl) {
    seedFranchiseArtworkPoster(catalog.catalogId, mergedCatalog.posterUrl);
    if (mergedCatalog.franchiseId) {
      seedFranchiseArtworkPoster(mergedCatalog.franchiseId, mergedCatalog.posterUrl);
    }
  }
  const related = mapRelatedTitles(enriched ?? undefined);
  const bundle: FranchiseCatalogEnrichment = {
    catalog: mergedCatalog,
    enriched: enriched ?? undefined,
    related,
  };

  metadataCacheSet(cacheKey, bundle, METADATA_CACHE_TTL.titleDetails);
  if (enriched) {
    metadataCacheSet(
      `enriched:${formatCatalogRef('anilist', searchResult.providerId)}`,
      enriched,
      METADATA_CACHE_TTL.titleDetails
    );
    metadataCacheSet(`details:${catalog.catalogId}`, mergedCatalog, METADATA_CACHE_TTL.titleDetails);
  }

  return bundle;
}

export async function fetchFranchiseArtworkPoster(
  catalogTitleId: string
): Promise<string | undefined> {
  const franchiseTitle = getCatalogTitleById(catalogTitleId);
  if (!franchiseTitle) return undefined;

  if (franchiseTitle.anilistMediaId) {
    const details = await anilistCatalogProvider.getTitleDetails(String(franchiseTitle.anilistMediaId));
    return details?.posterUrl;
  }

  const match = await resolveAnilistSearchResult(franchiseTitle);
  return match?.posterUrl;
}
