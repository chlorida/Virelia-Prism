import type { MetadataSearchResult } from './types';
import {
  getEnabledProviders,
  isAnyOnlineProviderConfigured,
  mergeDuplicateResults,
  searchAcrossProviders,
  searchPeopleAcrossProviders,
} from './providerRegistry';
import { filterCatalogResults } from './contentPolicyService';
import { rankSearchResults } from './searchRankingService';
import { isOnlineCatalogAvailable, readOnlineCatalogSettings } from './metadataSettings';
import { getGatewayAvailability } from './prismMetadataGatewayProvider';
import { runUnifiedLibrarySearch } from '../mediaIntelligence/librarySearchService';
import type { LibraryTitle } from '../mediaIntelligence/types';
import type { MediaItem } from '../../../shared/types';
import { metadataCacheGet, metadataCacheSet, METADATA_CACHE_TTL } from './metadataCache';

export type CatalogSearchScope = 'all' | 'library' | 'online' | 'franchises' | 'people' | 'files';

export interface CatalogSearchResponse {
  query: string;
  scope: CatalogSearchScope;
  local: ReturnType<typeof runUnifiedLibrarySearch>;
  online: MetadataSearchResult[];
  people: Awaited<ReturnType<typeof searchPeopleAcrossProviders>>;
  files: MediaItem[];
  loading: boolean;
  providerConfigured: boolean;
  onlineEnabled: boolean;
  onlineAvailable: boolean;
  gatewayStatus: 'available' | 'degraded' | 'unavailable';
  error?: string;
}

let activeSearchController: AbortController | null = null;

export function abortCatalogSearch(): void {
  activeSearchController?.abort();
  activeSearchController = null;
}

function filterFiles(items: MediaItem[], query: string, limit = 40): MediaItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .filter((item) => {
      const hay = [item.title, item.fileName, item.folder, item.searchText].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);
}

export async function runCatalogSearch(input: {
  query: string;
  scope: CatalogSearchScope;
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  limit?: number;
}): Promise<Omit<CatalogSearchResponse, 'loading'>> {
  const trimmed = input.query.trim();
  const cfg = readOnlineCatalogSettings();
  const limit = input.limit ?? 24;

  if (!trimmed) {
    return {
      query: trimmed,
      scope: input.scope,
      local: runUnifiedLibrarySearch('', input.libraryTitles),
      online: [],
      people: [],
      files: [],
      providerConfigured: isAnyOnlineProviderConfigured(),
      onlineEnabled: cfg.catalogSearchEnabled && cfg.enabled,
      onlineAvailable: isOnlineCatalogAvailable(),
      gatewayStatus: getGatewayAvailability(),
    };
  }

  activeSearchController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;

  const cacheKey = `search:${input.scope}:${trimmed.toLowerCase()}`;
  const cached = metadataCacheGet<Omit<CatalogSearchResponse, 'loading'>>(cacheKey);
  if (cached) return cached;

  try {
    const local = (input.scope === 'online' || input.scope === 'people')
      ? runUnifiedLibrarySearch('', input.libraryTitles)
      : runUnifiedLibrarySearch(trimmed, input.libraryTitles);

    let online: MetadataSearchResult[] = [];
    let people: Awaited<ReturnType<typeof searchPeopleAcrossProviders>> = [];
    let files: MediaItem[] = [];

    const wantsOnline = (input.scope === 'online' || input.scope === 'all')
      && cfg.catalogSearchEnabled
      && cfg.enabled;
    const wantsPeople = (input.scope === 'people' || input.scope === 'all') && cfg.enabled;
    const wantsFranchises = input.scope === 'franchises' || input.scope === 'all';

    if (input.scope === 'files' || input.scope === 'all') {
      files = filterFiles(input.mediaItems, trimmed, limit);
    }

    if (wantsOnline) {
      online = await searchAcrossProviders(trimmed, {
        limit,
        signal: controller.signal,
        includeAdult: cfg.includeAdultContent,
      });
    }

    if (wantsFranchises) {
      const franchiseOnly = await getEnabledProviders()
        .find((p) => p.id === 'franchise-catalog')
        ?.searchTitles(trimmed, { limit, signal: controller.signal }) ?? [];
      if (input.scope === 'franchises') {
        online = mergeDuplicateResults(franchiseOnly);
      } else {
        online = mergeDuplicateResults([...online, ...franchiseOnly]);
      }
    }

    online = filterCatalogResults(online, cfg.includeAdultContent);
    online = rankSearchResults(trimmed, online);

    const hasLocalHits = local.local.length > 0 || files.length > 0;
    const shouldSearchPeople = wantsPeople
      && (input.scope === 'people' || hasLocalHits || online.length > 0);
    if (shouldSearchPeople) {
      people = await searchPeopleAcrossProviders(trimmed, {
        limit,
        signal: controller.signal,
      });
    }

    const response: Omit<CatalogSearchResponse, 'loading'> = {
      query: trimmed,
      scope: input.scope,
      local,
      online,
      people,
      files,
      providerConfigured: isAnyOnlineProviderConfigured(),
      onlineEnabled: cfg.catalogSearchEnabled && cfg.enabled,
      onlineAvailable: isOnlineCatalogAvailable(),
      gatewayStatus: getGatewayAvailability(),
    };
    metadataCacheSet(
      cacheKey,
      response,
      online.length === 0 && people.length === 0 && local.local.length === 0 && files.length === 0
        ? METADATA_CACHE_TTL.searchEmptyResults
        : METADATA_CACHE_TTL.searchResults
    );
    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        query: trimmed,
        scope: input.scope,
        local: runUnifiedLibrarySearch(trimmed, input.libraryTitles),
        online: [],
        people: [],
        files: [],
        providerConfigured: isAnyOnlineProviderConfigured(),
        onlineEnabled: cfg.catalogSearchEnabled && cfg.enabled,
        onlineAvailable: isOnlineCatalogAvailable(),
        gatewayStatus: getGatewayAvailability(),
      };
    }
    return {
      query: trimmed,
      scope: input.scope,
      local: runUnifiedLibrarySearch(trimmed, input.libraryTitles),
      online: [],
      people: [],
      files: [],
      providerConfigured: isAnyOnlineProviderConfigured(),
      onlineEnabled: cfg.catalogSearchEnabled && cfg.enabled,
      onlineAvailable: isOnlineCatalogAvailable(),
      gatewayStatus: getGatewayAvailability(),
      error: error instanceof Error ? error.message : 'Search failed',
    };
  } finally {
    if (activeSearchController === controller) activeSearchController = null;
  }
}
