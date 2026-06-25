import type { MediaItem } from '../../../shared/types';
import { findSeriesAlias, getFranchiseId, normalizeAliasKey } from './aliasCache';
import { parseMediaIdentity, normalizeSeriesKey } from './episodeParser';
import { isRecommendableLocalItem } from './playableMediaFilter';

export interface RelatedArcHint {
  franchiseId: string;
  franchiseLabel?: string;
  item: MediaItem;
  arcKey: string;
  folderPath: string;
}

export function getFranchiseForItem(item: MediaItem): string | undefined {
  const identity = parseMediaIdentity(item.title, item.fileName);
  const key = normalizeSeriesKey(identity);
  return identity.franchiseId ?? getFranchiseId(key);
}

function arcLabelForItem(item: MediaItem, lang: 'en' | 'ru'): string | undefined {
  const identity = parseMediaIdentity(item.title, item.fileName);
  const alias = findSeriesAlias(normalizeSeriesKey(identity));
  if (!alias) return undefined;
  return lang === 'ru' ? alias.titles.ru ?? alias.titles.en : alias.titles.en;
}

/** All playable videos in other local folders sharing the same franchise (e.g. Gou while watching Sotsu). */
export function findRelatedFranchiseVideos(
  current: MediaItem,
  catalog: MediaItem[],
  lang: 'en' | 'ru' = 'en'
): RelatedArcHint[] {
  const franchiseId = getFranchiseForItem(current);
  if (!franchiseId) return [];

  const currentKey = normalizeSeriesKey(parseMediaIdentity(current.title, current.fileName));
  const hints: RelatedArcHint[] = [];

  for (const item of catalog) {
    if (!isRecommendableLocalItem(item, current.id)) continue;
    if (item.kind !== 'video') continue;
    if (item.folder === current.folder) continue;

    const identity = parseMediaIdentity(item.title, item.fileName);
    const itemFranchise = identity.franchiseId ?? getFranchiseId(normalizeSeriesKey(identity));
    if (itemFranchise !== franchiseId) continue;

    const itemKey = normalizeSeriesKey(identity);
    if (itemKey === currentKey) continue;

    hints.push({
      franchiseId,
      franchiseLabel: arcLabelForItem(item, lang),
      item,
      arcKey: itemKey,
      folderPath: item.folder,
    });
  }

  hints.sort((a, b) => {
    if (a.folderPath !== b.folderPath) return a.folderPath.localeCompare(b.folderPath);
    const epA = parseMediaIdentity(a.item.title, a.item.fileName).episodeNumber ?? 9999;
    const epB = parseMediaIdentity(b.item.title, b.item.fileName).episodeNumber ?? 9999;
    return epA - epB;
  });

  return hints.slice(0, 12);
}
