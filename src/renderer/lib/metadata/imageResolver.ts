import type { LibraryTitle } from '../mediaIntelligence/types';
import type { CatalogTitle, MetadataSearchResult, LocalAvailability } from './types';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from './metadataCache';

export type ImageKind = 'poster' | 'backdrop' | 'card' | 'hero';

export interface ImageResolution {
  url?: string;
  source: 'metadata' | 'cache' | 'local' | 'franchise' | 'generated';
  failed?: boolean;
}

const failedUrls = new Set<string>();

export function markImageUrlFailed(url: string): void {
  if (url) failedUrls.add(url);
}

export function isImageUrlFailed(url?: string): boolean {
  return Boolean(url && failedUrls.has(url));
}

function cacheKey(kind: ImageKind, id: string): string {
  return `img:${kind}:${id}`;
}

function readCachedImage(kind: ImageKind, id: string): string | undefined {
  return metadataCacheGet<string>(cacheKey(kind, id));
}

function writeCachedImage(kind: ImageKind, id: string, url: string): void {
  metadataCacheSet(cacheKey(kind, id), url, METADATA_CACHE_TTL.images);
}

function localTitlePoster(title?: LibraryTitle): string | undefined {
  if (!title) return undefined;
  return title.posterUrl ?? title.localPosterPath;
}

function localTitleBackdrop(title?: LibraryTitle): string | undefined {
  if (!title) return undefined;
  return title.backdropPath;
}

function resolveUrl(url?: string): string | undefined {
  if (!url || isImageUrlFailed(url)) return undefined;
  return url;
}

export function getPosterForTitle(input: {
  catalog?: Pick<CatalogTitle, 'catalogId' | 'posterUrl'>;
  searchResult?: Pick<MetadataSearchResult, 'catalogId' | 'posterUrl'>;
  localTitle?: LibraryTitle;
  franchisePosterUrl?: string;
  titleLabel: string;
}): ImageResolution {
  const id = input.catalog?.catalogId ?? input.searchResult?.catalogId ?? input.localTitle?.id ?? input.titleLabel;
  const metadataUrl = resolveUrl(input.catalog?.posterUrl ?? input.searchResult?.posterUrl);
  if (metadataUrl) {
    writeCachedImage('poster', id, metadataUrl);
    return { url: metadataUrl, source: 'metadata' };
  }
  const cached = readCachedImage('poster', id);
  if (cached && !isImageUrlFailed(cached)) return { url: cached, source: 'cache' };
  const local = resolveUrl(localTitlePoster(input.localTitle));
  if (local) return { url: local, source: 'local' };
  const franchise = resolveUrl(input.franchisePosterUrl);
  if (franchise) return { url: franchise, source: 'franchise' };
  return { source: 'generated' };
}

export function getBackdropForTitle(input: {
  catalog?: Pick<CatalogTitle, 'catalogId' | 'backdropUrl' | 'posterUrl'>;
  searchResult?: Pick<MetadataSearchResult, 'catalogId' | 'posterUrl'>;
  localTitle?: LibraryTitle;
  franchiseBackdropUrl?: string;
}): ImageResolution {
  const id = input.catalog?.catalogId ?? input.searchResult?.catalogId ?? input.localTitle?.id ?? 'backdrop';
  const metadataUrl = resolveUrl(input.catalog?.backdropUrl);
  if (metadataUrl) {
    writeCachedImage('backdrop', id, metadataUrl);
    return { url: metadataUrl, source: 'metadata' };
  }
  const cached = readCachedImage('backdrop', id);
  if (cached && !isImageUrlFailed(cached)) return { url: cached, source: 'cache' };
  const local = resolveUrl(localTitleBackdrop(input.localTitle));
  if (local) return { url: local, source: 'local' };
  const franchise = resolveUrl(input.franchiseBackdropUrl);
  if (franchise) return { url: franchise, source: 'franchise' };
  const posterFallback = resolveUrl(input.catalog?.posterUrl ?? input.searchResult?.posterUrl);
  if (posterFallback) return { url: posterFallback, source: 'metadata' };
  return { source: 'generated' };
}

export function getCardImage(input: Parameters<typeof getPosterForTitle>[0]): ImageResolution {
  return getPosterForTitle(input);
}

export function getHeroImage(input: Parameters<typeof getBackdropForTitle>[0]): ImageResolution {
  return getBackdropForTitle(input);
}

export function availabilityBadgeVariant(availability?: LocalAvailability): string {
  switch (availability) {
    case 'in_library':
      return 'in-library';
    case 'partial':
      return 'partial';
    case 'metadata_only':
      return 'metadata-only';
    default:
      return 'not-in-library';
  }
}
