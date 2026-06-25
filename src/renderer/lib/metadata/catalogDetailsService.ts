import type { EnrichedTitleMetadata } from '../../../shared/titleMetadataTypes';
import type { CatalogTitle, MetadataSearchResult } from './types';
import { parseCatalogRef } from './catalogRef';
import { getTitleDetailsFromRef, getRelatedFromRef } from './providerRegistry';
import { getCatalogTitleByIdFromAnySource } from './catalogService';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from './metadataCache';
import { anilistProvider } from '../mediaIntelligence/metadata/providers/anilistProvider';
import { attachMediaSupplement } from '../mediaIntelligence/metadata/titleMetadataService';
import { enrichFranchiseCatalogBundle } from '../mediaIntelligence/franchise/franchiseCatalogEnrichment';

export interface CatalogTitleBundle {
  catalog: CatalogTitle | null;
  enriched?: EnrichedTitleMetadata;
  related: MetadataSearchResult[];
}

export function catalogEnrichedCacheKey(catalogRef: string): string {
  return `enriched:${catalogRef}`;
}

export function getCachedCatalogEnriched(catalogRef: string): EnrichedTitleMetadata | undefined {
  return metadataCacheGet<EnrichedTitleMetadata>(catalogEnrichedCacheKey(catalogRef));
}

export function seedCatalogTitle(catalogRef: string): CatalogTitle | null {
  return (
    metadataCacheGet<CatalogTitle>(`details:${catalogRef}`)
    ?? getCatalogTitleByIdFromAnySource(catalogRef)
    ?? null
  );
}

export async function fetchCatalogTitleDetails(
  catalogRef: string,
  options?: { signal?: AbortSignal }
): Promise<CatalogTitle | null> {
  const cacheKey = `details:${catalogRef}`;
  const cached = metadataCacheGet<CatalogTitle>(cacheKey);
  if (cached) return cached;

  const { provider } = parseCatalogRef(catalogRef);
  let title: CatalogTitle | null = null;
  if (provider === 'franchise-catalog') {
    title = getCatalogTitleByIdFromAnySource(catalogRef);
  } else {
    title = await getTitleDetailsFromRef(catalogRef, options);
  }
  if (title) metadataCacheSet(cacheKey, title, METADATA_CACHE_TTL.titleDetails);
  return title;
}

export async function fetchCatalogRelatedTitles(
  catalogRef: string,
  options?: { signal?: AbortSignal }
) {
  return getRelatedFromRef(catalogRef, options);
}

export async function fetchCatalogTitleBundle(
  catalogRef: string,
  options?: { signal?: AbortSignal },
): Promise<CatalogTitleBundle> {
  const { provider, providerId } = parseCatalogRef(catalogRef);
  const bundleCacheKey = `bundle:v2:${catalogRef}`;
  const cached = metadataCacheGet<CatalogTitleBundle>(bundleCacheKey);
  const needsFranchiseRefresh = provider === 'franchise-catalog'
    && cached
    && (!cached.enriched || !cached.catalog?.posterUrl);
  if (cached && !needsFranchiseRefresh) return cached;

  const [catalog, related] = await Promise.all([
    fetchCatalogTitleDetails(catalogRef, options),
    fetchCatalogRelatedTitles(catalogRef, options),
  ]);

  let resolvedCatalog = catalog;
  let resolvedRelated = related;

  let enriched = getCachedCatalogEnriched(catalogRef);
  if (catalog && (provider === 'franchise-catalog' || !enriched)) {
    if (provider === 'anilist') {
      try {
        enriched = (await anilistProvider.getDetails(providerId, 'en', 1) as EnrichedTitleMetadata | null) ?? undefined;
        if (enriched) {
          metadataCacheSet(catalogEnrichedCacheKey(catalogRef), enriched, METADATA_CACHE_TTL.titleDetails);
        }
      } catch {
        enriched = undefined;
      }
    } else if (provider === 'franchise-catalog') {
      const franchiseBundle = await enrichFranchiseCatalogBundle(catalog, options);
      resolvedCatalog = franchiseBundle.catalog;
      enriched = franchiseBundle.enriched ?? enriched;
      if (franchiseBundle.related.length > 0) {
        resolvedRelated = franchiseBundle.related;
      }
      if (enriched) {
        metadataCacheSet(catalogEnrichedCacheKey(catalogRef), enriched, METADATA_CACHE_TTL.titleDetails);
      }
    }
  }

  if (enriched && provider !== 'franchise-catalog') {
    try {
      enriched = await attachMediaSupplement(enriched);
      metadataCacheSet(catalogEnrichedCacheKey(catalogRef), enriched, METADATA_CACHE_TTL.titleDetails);
    } catch {
      // keep base enriched metadata
    }
  }

  const bundle: CatalogTitleBundle = {
    catalog: resolvedCatalog,
    enriched,
    related: resolvedRelated,
  };
  if (bundle.catalog) {
    metadataCacheSet(bundleCacheKey, bundle, METADATA_CACHE_TTL.titleDetails);
  }
  return bundle;
}
