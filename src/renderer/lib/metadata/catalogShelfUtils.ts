import type { LibraryTitle } from '../mediaIntelligence/types';
import type { CatalogMediaType, RecommendationItem } from './types';

function mapCatalogType(type: CatalogMediaType | string): LibraryTitle['mediaType'] {
  if (type === 'movie') return 'movie';
  if (type === 'ova') return 'ova';
  if (type === 'special') return 'special';
  if (type === 'series' || type === 'anime') return 'series';
  return 'unknown';
}

export function recommendationToLibraryTitle(
  item: RecommendationItem,
  localTitle?: LibraryTitle
): LibraryTitle {
  if (localTitle) return localTitle;

  return {
    id: item.catalogId ?? item.localTitleId ?? `catalog:${item.title}`,
    canonicalTitle: item.title,
    displayTitle: item.title,
    year: item.year,
    mediaType: mapCatalogType(item.type),
    items: [],
    uniqueEpisodeCount: 0,
    totalFileCount: 0,
    duplicateVersionCount: 0,
    posterUrl: item.posterUrl,
    confidence: item.score ?? 0.5,
    source: 'external-metadata',
  };
}
