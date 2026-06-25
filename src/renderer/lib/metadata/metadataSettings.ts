import { defaultSettings } from '../../../shared/defaults';

import type { AppSettings } from '../../../shared/types';

import { getSettingsSnapshot } from '../../features/settings/settingsStore';

import { isOnlineCatalogReachable } from './prismMetadataGatewayProvider';

import { anilistCatalogProvider } from './providers/anilistCatalogProvider';

import { devCatalogMockProvider } from './providers/devCatalogMockProvider';

/** Whether title metadata enrichment and online artwork may run. */
export function resolveOnlineMetadataEnabled(settings?: AppSettings): boolean {
  const snapshot = settings ?? getSettingsSnapshot();
  const discovery = { ...defaultSettings.discovery, ...snapshot.discovery };
  const metadata = { ...defaultSettings.metadata, ...snapshot.metadata };
  if (discovery.disableOnlineDiscovery) return false;
  return Boolean(metadata.enableOnlineLookup || discovery.enableOnlineCatalog);
}

export interface OnlineCatalogRuntimeSettings {

  enabled: boolean;

  catalogSearchEnabled: boolean;

  discoverRailsEnabled: boolean;

  gatewayBaseUrl: string;

  includeAdultContent: boolean;

  region: string;

  preferredLanguage: AppSettings['metadata']['preferredLanguage'];

}



export function readOnlineCatalogSettings(settings?: AppSettings): OnlineCatalogRuntimeSettings {

  const snapshot = settings ?? getSettingsSnapshot();

  const discovery = { ...defaultSettings.discovery, ...snapshot.discovery };

  const metadata = { ...defaultSettings.metadata, ...snapshot.metadata };

  const online = resolveOnlineMetadataEnabled(settings);
  const catalogAllowed = online && discovery.enableOnlineCatalog;

  return {

    enabled: catalogAllowed,

    catalogSearchEnabled: catalogAllowed && discovery.enableCatalogSearch,

    discoverRailsEnabled: catalogAllowed && discovery.enableDiscoverCatalogRails,

    gatewayBaseUrl: String(discovery.gatewayBaseUrl ?? '').trim(),

    includeAdultContent: Boolean(discovery.includeAdultContent),

    region: discovery.region ?? 'auto',

    preferredLanguage: metadata.preferredLanguage ?? 'auto',

  };

}



export function isOnlineCatalogAvailable(settings?: AppSettings): boolean {

  const cfg = readOnlineCatalogSettings(settings);

  if (!cfg.enabled) return false;

  return (

    isOnlineCatalogReachable()

    || anilistCatalogProvider.isConfigured()

    || devCatalogMockProvider.isConfigured()

  );

}



export function isGatewayOnlyMode(settings?: AppSettings): boolean {

  const cfg = readOnlineCatalogSettings(settings);

  return cfg.enabled && !isOnlineCatalogReachable() && !anilistCatalogProvider.isConfigured();

}


