import type { CatalogTitle, MetadataSearchResult } from '../types';
import { formatCatalogRef } from '../catalogRef';
import type { MetadataProvider } from '../metadataProvider';
import { isDevMockCatalogEnabled } from '../prismMetadataConfig';

const MOCK_RESULTS: MetadataSearchResult[] = [
  {
    catalogId: formatCatalogRef('dev-mock', 'doctor-who'),
    provider: 'dev-mock',
    providerId: 'doctor-who',
    title: 'Doctor Who',
    year: 2005,
    type: 'series',
    overview: 'Dev mock result — enable real gateway for production catalog.',
    confidence: 0.1,
    source: 'dev-mock',
  },
];

export const devCatalogMockProvider: MetadataProvider = {
  id: 'dev-mock',
  displayName: 'Dev Mock Catalog',
  isConfigured: () => isDevMockCatalogEnabled(),
  async searchTitles(query) {
    if (!isDevMockCatalogEnabled()) return [];
    const q = query.trim().toLowerCase();
    return MOCK_RESULTS.filter((item) => item.title.toLowerCase().includes(q) || q.includes('doctor'));
  },
  async getTitleDetails(providerId) {
    if (!isDevMockCatalogEnabled()) return null;
    const hit = MOCK_RESULTS.find((r) => r.providerId === providerId);
    if (!hit) return null;
    return {
      catalogId: hit.catalogId,
      provider: 'dev-mock',
      providerId: hit.providerId,
      title: hit.title,
      year: hit.year,
      type: hit.type,
      synopsis: hit.overview,
      genres: ['Sci-Fi'],
      studios: [],
      countries: ['GB'],
      languages: ['en'],
      contentWarnings: [],
      source: 'dev-mock',
      fetchedAt: new Date().toISOString(),
    } satisfies CatalogTitle;
  },
};
