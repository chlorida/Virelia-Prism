import type { MetadataProvider } from './types';

/**
 * Registry for optional background metadata providers (AniList, Kitsu, TMDb, etc.).
 * Providers are registered at app init; lookup always runs async and off the UI hot path.
 */
const providers = new Map<string, MetadataProvider>();

export function registerMetadataProvider(provider: MetadataProvider): void {
  providers.set(provider.id, provider);
}

export function unregisterMetadataProvider(providerId: string): void {
  providers.delete(providerId);
}

export function listMetadataProviders(): MetadataProvider[] {
  return [...providers.values()];
}

export function getMetadataProvider(providerId: string): MetadataProvider | undefined {
  return providers.get(providerId);
}

/** Future: score and rank provider search results against local SmartTitleResolution candidates. */
export interface MetadataMatchCandidate {
  providerId: string;
  providerMediaId: string;
  title: string;
  year?: number;
  confidence: number;
}
