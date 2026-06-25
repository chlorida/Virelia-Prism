import type { MetadataSearchResult } from './types';
import type { MetadataProvider, MetadataSearchOptions } from './metadataProvider';
import { getGatewayBaseUrl } from './prismMetadataConfig';
import { readOnlineCatalogSettings } from './metadataSettings';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from './metadataCache';
import { anilistCatalogProvider } from './providers/anilistCatalogProvider';
import { devCatalogMockProvider } from './providers/devCatalogMockProvider';
import { mergeDuplicateResults } from './metadataMergeUtils';

export type GatewayAvailability = 'available' | 'degraded' | 'unavailable';

interface GatewayStatus {
  availability: GatewayAvailability;
  lastCheckedAt: number;
  lastError?: string;
}

let gatewayStatus: GatewayStatus = {
  availability: 'degraded',
  lastCheckedAt: 0,
};

const GATEWAY_FETCH_TIMEOUT_MS = 4_000;
const GATEWAY_UNAVAILABLE_COOLDOWN_MS = 90_000;

export function getGatewayAvailability(): GatewayAvailability {
  return gatewayStatus.availability;
}

/** Skip gateway unless it has proven reachable; avoids 4s timeouts on every search. */
export function shouldUseDirectCatalogOnly(): boolean {
  return gatewayStatus.availability !== 'available';
}

/** Mark AniList/direct catalog as active when gateway is down but fallback succeeded. */
export function markDirectCatalogFallbackActive(): void {
  if (gatewayStatus.availability === 'unavailable') {
    setGatewayStatus('degraded', 'Using direct catalog fallback');
  }
}

export function getGatewayStatusMessage(): string | undefined {
  if (gatewayStatus.availability === 'available') return undefined;
  return gatewayStatus.lastError;
}

function setGatewayStatus(availability: GatewayAvailability, lastError?: string): void {
  gatewayStatus = { availability, lastCheckedAt: Date.now(), lastError };
}

function resolveGatewayUrl(): string {
  const cfg = readOnlineCatalogSettings();
  return getGatewayBaseUrl(cfg.gatewayBaseUrl);
}

async function gatewayFetch<T>(path: string, options?: { signal?: AbortSignal }): Promise<T | null> {
  if (shouldUseDirectCatalogOnly()) return null;

  const base = resolveGatewayUrl();
  const url = `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), GATEWAY_FETCH_TIMEOUT_MS);
  const onExternalAbort = () => timeoutController.abort();
  options?.signal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: timeoutController.signal,
    });
    if (!response.ok) {
      setGatewayStatus('degraded', `Gateway HTTP ${response.status}`);
      return null;
    }
    setGatewayStatus('available');
    return (await response.json()) as T;
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    const message = aborted
      ? `Gateway timeout after ${GATEWAY_FETCH_TIMEOUT_MS}ms`
      : (error instanceof Error ? error.message : 'Gateway unreachable');
    setGatewayStatus('unavailable', message);
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
    options?.signal?.removeEventListener('abort', onExternalAbort);
  }
}

async function searchViaDirectFallback(
  query: string,
  options?: MetadataSearchOptions
): Promise<MetadataSearchResult[]> {
  const batches: MetadataSearchResult[][] = [];
  if (anilistCatalogProvider.isConfigured()) {
    batches.push(await anilistCatalogProvider.searchTitles(query, options).catch(() => []));
  }
  if (devCatalogMockProvider.isConfigured()) {
    batches.push(await devCatalogMockProvider.searchTitles(query, options).catch(() => []));
  }
  return mergeDuplicateResults(batches.flat());
}

async function searchViaGateway(
  query: string,
  options?: MetadataSearchOptions
): Promise<MetadataSearchResult[] | null> {
  const cacheKey = `gateway:search:${query.toLowerCase()}:${options?.type ?? 'all'}`;
  const cached = metadataCacheGet<MetadataSearchResult[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ q: query, limit: String(options?.limit ?? 24) });
  if (options?.type) params.set('type', options.type);
  const data = await gatewayFetch<{ results?: MetadataSearchResult[] }>(
    `/search/titles?${params}`,
    { signal: options?.signal }
  );
  if (!data?.results) return null;
  metadataCacheSet(cacheKey, data.results, METADATA_CACHE_TTL.searchResults);
  return data.results;
}

export const prismMetadataGatewayProvider: MetadataProvider = {
  id: 'prism-gateway',
  displayName: 'Prism Catalog',
  isConfigured: () => readOnlineCatalogSettings().enabled,
  async searchTitles(query, options) {
    const gatewayResults = await searchViaGateway(query, options);
    if (gatewayResults && gatewayResults.length > 0) return gatewayResults;
    const fallback = await searchViaDirectFallback(query, options);
    if (fallback.length > 0 && gatewayStatus.availability !== 'available') {
      setGatewayStatus('degraded', 'Using direct catalog fallback');
    }
    return fallback;
  },
  async getTitleDetails(providerId, options) {
    const data = await gatewayFetch<{ title?: import('./types').CatalogTitle }>(
      `/titles/${encodeURIComponent(providerId)}`,
      { signal: options?.signal }
    );
    if (data?.title) return data.title;
    if (providerId.startsWith('anilist:') || /^\d+$/.test(providerId)) {
      const id = providerId.replace(/^anilist:/, '');
      return anilistCatalogProvider.getTitleDetails(id, options);
    }
    return devCatalogMockProvider.getTitleDetails(providerId, options);
  },
  async getTrendingTitles(options) {
    const data = await gatewayFetch<{ results?: MetadataSearchResult[] }>('/discover/trending', {
      signal: options?.signal,
    });
    if (data?.results?.length) return data.results;
    return anilistCatalogProvider.getTrendingTitles?.(options) ?? [];
  },
  async getPopularTitles(options) {
    const data = await gatewayFetch<{ results?: MetadataSearchResult[] }>('/discover/popular', {
      signal: options?.signal,
    });
    if (data?.results?.length) return data.results;
    return anilistCatalogProvider.getPopularTitles?.(options) ?? [];
  },
  async getSimilarTitles(providerId, options) {
    const data = await gatewayFetch<{ results?: MetadataSearchResult[] }>(
      `/titles/${encodeURIComponent(providerId)}/similar`,
      { signal: options?.signal }
    );
    if (data?.results?.length) return data.results;
    return anilistCatalogProvider.getSimilarTitles?.(providerId, options) ?? [];
  },
  async getRelatedTitles(providerId, options) {
    const data = await gatewayFetch<{ results?: MetadataSearchResult[] }>(
      `/titles/${encodeURIComponent(providerId)}/related`,
      { signal: options?.signal }
    );
    if (data?.results?.length) return data.results;
    return anilistCatalogProvider.getRelatedTitles?.(providerId, options) ?? [];
  },
};

export function isOnlineCatalogReachable(): boolean {
  const status = getGatewayAvailability();
  return status === 'available' || status === 'degraded';
}

export async function pingMetadataGateway(): Promise<GatewayAvailability> {
  await gatewayFetch('/health');
  return getGatewayAvailability();
}
