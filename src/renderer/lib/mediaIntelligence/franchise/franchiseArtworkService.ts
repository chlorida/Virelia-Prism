import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from '../../metadata/metadataCache';
import { searchAcrossProviders } from '../../metadata/providerRegistry';
import { getCatalogTitleById, getFranchiseCatalogEntry } from './franchiseCatalog';
import { fetchFranchiseArtworkPoster } from './franchiseCatalogEnrichment';
import { anilistCatalogProvider } from '../../metadata/providers/anilistCatalogProvider';

type Listener = () => void;

const memory = new Map<string, string>();
const inflight = new Set<string>();
const listeners = new Set<Listener>();

function cacheKey(artworkKey: string): string {
  return `franchise-artwork:poster:${artworkKey}`;
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeFranchiseArtwork(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function seedFranchiseArtworkPoster(artworkKey: string, posterUrl: string | undefined): void {
  if (!artworkKey || !posterUrl) return;
  memory.set(artworkKey, posterUrl);
  metadataCacheSet(cacheKey(artworkKey), posterUrl, METADATA_CACHE_TTL.images);
  notify();
}

export function getFranchiseArtworkPoster(artworkKey: string): string | undefined {
  const cachedMemory = memory.get(artworkKey);
  if (cachedMemory) return cachedMemory;
  const cached = metadataCacheGet<string>(cacheKey(artworkKey));
  if (cached) {
    memory.set(artworkKey, cached);
    return cached;
  }
  return undefined;
}

function pickBestPoster(
  results: Awaited<ReturnType<typeof searchAcrossProviders>>,
  searchTitle: string
): string | undefined {
  const normalized = searchTitle.trim().toLowerCase();
  const ranked = results
    .filter((result) => Boolean(result.posterUrl))
    .map((result) => {
      const title = result.title.trim().toLowerCase();
      let score = result.confidence ?? 0.5;
      if (title === normalized) score += 2;
      else if (title.includes(normalized) || normalized.includes(title)) score += 1;
      if (result.type === 'anime' || result.type === 'series') score += 0.15;
      return { result, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.result.posterUrl;
}

function storePoster(artworkKey: string, posterUrl: string | undefined): void {
  if (posterUrl) {
    seedFranchiseArtworkPoster(artworkKey, posterUrl);
  }
}

async function fetchPosterForKey(artworkKey: string, searchTitle: string): Promise<string | undefined> {
  if (getCatalogTitleById(artworkKey)) {
    return fetchFranchiseArtworkPoster(artworkKey);
  }

  const franchise = getFranchiseCatalogEntry(artworkKey);
  if (franchise) {
    const primary = franchise.titles.find((title) => title.anilistMediaId);
    if (primary?.anilistMediaId) {
      const details = await anilistCatalogProvider.getTitleDetails(String(primary.anilistMediaId));
      if (details?.posterUrl) return details.posterUrl;
    }
    const results = await anilistCatalogProvider.searchTitles(franchise.franchiseName, { limit: 8 });
    return pickBestPoster(results, franchise.franchiseName);
  }

  const results = await anilistCatalogProvider.searchTitles(searchTitle, { limit: 8 });
  const direct = pickBestPoster(results, searchTitle);
  if (direct) return direct;

  const merged = await searchAcrossProviders(searchTitle, { limit: 12 });
  return pickBestPoster(merged, searchTitle);
}

export function requestFranchiseArtworkPoster(artworkKey: string, searchTitle: string): void {
  const trimmed = searchTitle.trim();
  if (!artworkKey || !trimmed) return;
  if (getFranchiseArtworkPoster(artworkKey)) return;
  if (inflight.has(artworkKey)) return;

  inflight.add(artworkKey);
  void (async () => {
    try {
      const posterUrl = await fetchPosterForKey(artworkKey, trimmed);
      storePoster(artworkKey, posterUrl);
    } catch {
      storePoster(artworkKey, undefined);
    } finally {
      inflight.delete(artworkKey);
      notify();
    }
  })();
}
