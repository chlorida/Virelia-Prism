import type { WatchOption } from './types';
import type { WatchOptionsProvider } from './metadataProvider';

/** Mock watch-options provider — returns empty unless dev mock flag is set. */
export const mockWatchOptionsProvider: WatchOptionsProvider = {
  id: 'mock-watch',
  async getWatchOptions(_catalogId, region) {
    if (!import.meta.env.DEV) return [];
    return [{
      providerId: 'mock-stream',
      providerName: 'Mock Stream (dev only)',
      type: 'subscription',
      region,
      verified: true,
      source: 'mock',
      fetchedAt: new Date().toISOString(),
      confidence: 'low',
    }];
  },
};

const providers: WatchOptionsProvider[] = [mockWatchOptionsProvider];

export async function fetchWatchOptions(catalogId: string, region: string): Promise<WatchOption[]> {
  const results: WatchOption[] = [];
  for (const provider of providers) {
    const options = await provider.getWatchOptions(catalogId, region);
    results.push(...options.filter((o) => o.verified));
  }
  return results;
}
