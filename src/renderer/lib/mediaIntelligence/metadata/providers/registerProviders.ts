import { registerMetadataProvider } from '../metadataProviderRegistry';
import { anilistProvider } from './anilistProvider';
import { jikanProvider } from './jikanProvider';
import type { MetadataProvider } from '../types';

/** Placeholder for TMDb — enable only when user supplies API key in settings. */
const tmdbStub: MetadataProvider = {
  id: 'tmdb',
  name: 'TMDb',
  async search() {
    return [];
  },
  async getDetails() {
    return null;
  },
};

let registered = false;

/** Register built-in providers once (offline-safe stubs + anime providers). */
export function registerDefaultMetadataProviders(): void {
  if (registered) return;
  registered = true;
  registerMetadataProvider(anilistProvider);
  registerMetadataProvider(jikanProvider);
  registerMetadataProvider(tmdbStub);
}
