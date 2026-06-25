import type { MetadataSearchResult } from './types';

import type { MetadataProvider, MetadataSearchOptions } from './metadataProvider';

import { franchiseCatalogProvider } from './catalogService';

import { anilistCatalogProvider } from './providers/anilistCatalogProvider';
import { tmdbCatalogProvider } from './providers/tmdbCatalogProvider';
import { tvmazeCatalogProvider } from './providers/tvmazeCatalogProvider';

import { devCatalogMockProvider } from './providers/devCatalogMockProvider';

import {

  getGatewayAvailability,

  isOnlineCatalogReachable,

  prismMetadataGatewayProvider,

  shouldUseDirectCatalogOnly,

} from './prismMetadataGatewayProvider';

import { readOnlineCatalogSettings } from './metadataSettings';

import { parseCatalogRef } from './catalogRef';

import { mergeDuplicateResults } from './metadataMergeUtils';



const franchiseProvider: MetadataProvider = {

  ...franchiseCatalogProvider,

  displayName: 'Franchise Catalog',

  isConfigured: () => true,

};



const ALL_PROVIDERS: MetadataProvider[] = [

  franchiseProvider,

  prismMetadataGatewayProvider,

  anilistCatalogProvider,

  tmdbCatalogProvider,

  tvmazeCatalogProvider,

  devCatalogMockProvider,

];



export function getProviderById(id: string): MetadataProvider | undefined {

  return ALL_PROVIDERS.find((provider) => provider.id === id);

}



export function getEnabledProviders(): MetadataProvider[] {

  const cfg = readOnlineCatalogSettings();

  const providers: MetadataProvider[] = [franchiseProvider];

  if (!cfg.enabled) return providers;

  if (getGatewayAvailability() === 'available' && prismMetadataGatewayProvider.isConfigured()) {
    providers.push(prismMetadataGatewayProvider);
  } else {
    providers.push(tvmazeCatalogProvider);
    if (tmdbCatalogProvider.isConfigured()) {
      providers.push(tmdbCatalogProvider);
    }
    if (anilistCatalogProvider.isConfigured()) {
      providers.push(anilistCatalogProvider);
    }
  }

  if (devCatalogMockProvider.isConfigured()) {

    providers.push(devCatalogMockProvider);

  }

  return providers;

}



export function getPrimaryOnlineProvider(): MetadataProvider | undefined {

  const cfg = readOnlineCatalogSettings();

  if (!cfg.enabled) return undefined;

  if (prismMetadataGatewayProvider.isConfigured()) return prismMetadataGatewayProvider;

  if (anilistCatalogProvider.isConfigured()) return anilistCatalogProvider;

  return undefined;

}



export function isAnyOnlineProviderConfigured(): boolean {

  const cfg = readOnlineCatalogSettings();

  if (!cfg.enabled) return false;

  return isOnlineCatalogReachable()
    || tvmazeCatalogProvider.isConfigured()
    || tmdbCatalogProvider.isConfigured()
    || anilistCatalogProvider.isConfigured()
    || devCatalogMockProvider.isConfigured();

}



export { mergeDuplicateResults };



export async function searchAcrossProviders(

  query: string,

  options?: MetadataSearchOptions & { providers?: string[] }

): Promise<MetadataSearchResult[]> {

  const cfg = readOnlineCatalogSettings();

  if (!cfg.catalogSearchEnabled || !cfg.enabled) return [];



  const providers = (options?.providers

    ? options.providers.map((id) => getProviderById(id)).filter(Boolean)

    : getEnabledProviders()) as MetadataProvider[];



  const onlineProviders = providers.filter((p) => p.id !== 'franchise-catalog');

  const localProviders = providers.filter((p) => p.id === 'franchise-catalog');



  const batches = await Promise.all([

    ...localProviders.map((provider) => provider.searchTitles(query, options).catch(() => [])),

    ...onlineProviders.map((provider) => provider.isConfigured()

      ? provider.searchTitles(query, options).catch(() => [])

      : Promise.resolve([])),

  ]);

  const merged = mergeDuplicateResults(batches.flat());
  return merged;

}



export async function getTitleDetailsFromRef(

  catalogRef: string,

  options?: { signal?: AbortSignal }

): Promise<import('./types').CatalogTitle | null> {

  const { provider, providerId } = parseCatalogRef(catalogRef);

  if (provider === 'dev-mock') {

    return devCatalogMockProvider.getTitleDetails(providerId, options);

  }

  const impl = getProviderById(provider === 'franchise-catalog' ? 'franchise-catalog' : provider);

  if (!impl) {

    if (provider === 'anilist') return anilistCatalogProvider.getTitleDetails(providerId, options);

    if (provider === 'tvmaze') return tvmazeCatalogProvider.getTitleDetails(providerId, options);

    if (provider === 'tmdb') return tmdbCatalogProvider.getTitleDetails(providerId, options);

    if (provider === 'prism-gateway') return prismMetadataGatewayProvider.getTitleDetails(providerId, options);

    return null;

  }

  if (provider !== 'franchise-catalog' && !impl.isConfigured()) return null;

  return impl.getTitleDetails(providerId, options);

}



export async function getRelatedFromRef(

  catalogRef: string,

  options?: { signal?: AbortSignal }

): Promise<MetadataSearchResult[]> {

  const { provider, providerId } = parseCatalogRef(catalogRef);

  const impl = getProviderById(provider === 'anilist' ? 'anilist' : provider);

  if (!impl?.getRelatedTitles) {

    if (prismMetadataGatewayProvider.isConfigured()) {

      return prismMetadataGatewayProvider.getRelatedTitles?.(providerId, options) ?? [];

    }

    return [];

  }

  return impl.getRelatedTitles(providerId, options).catch(() => []);

}



export async function searchPeopleAcrossProviders(

  query: string,

  options?: MetadataSearchOptions

): Promise<import('./types').CatalogPerson[]> {

  const providers = getEnabledProviders().filter((p) => p.searchPeople && p.isConfigured());

  const batches = await Promise.all(

    providers.map((provider) => provider.searchPeople!(query, options).catch(() => []))

  );

  const merged = batches.flat();

  const seen = new Set<string>();

  return merged.filter((person) => {

    const key = person.name.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);

    return true;

  });

}


