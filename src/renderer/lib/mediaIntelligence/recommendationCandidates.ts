import type { MediaItem } from '../../../shared/types';
import { getFolderIndex } from './mediaIdentityCache';
import { getFranchiseForItem } from './franchiseGrouping';
import { isRecommendableLocalItem } from './playableMediaFilter';

const MAX_CANDIDATES = 800;

/** Build a bounded candidate pool — never scan all 27k items for scoring. */
export function collectRecommendationCandidates(
  current: MediaItem,
  historyItems: MediaItem[],
  mediaById: Map<string, MediaItem>
): MediaItem[] {
  const map = new Map<string, MediaItem>();

  // Always include every indexed file in the current folder (folder index can lag behind mediaById).
  for (const item of mediaById.values()) {
    if (item.folder === current.folder && isRecommendableLocalItem(item, current.id)) {
      map.set(item.id, item);
    }
  }

  const folderIndex = getFolderIndex();

  const sameFolder = folderIndex.get(current.folder) ?? [];
  for (const item of sameFolder) {
    if (isRecommendableLocalItem(item, current.id)) map.set(item.id, item);
  }

  if (current.kind === 'video') {
    const franchise = getFranchiseForItem(current);
    if (franchise) {
      for (const [folder, items] of folderIndex) {
        if (folder === current.folder) continue;
        for (const item of items) {
          if (item.kind !== 'video') continue;
          if (!isRecommendableLocalItem(item, current.id)) continue;
          if (getFranchiseForItem(item) === franchise) map.set(item.id, item);
          if (map.size >= MAX_CANDIDATES) break;
        }
        if (map.size >= MAX_CANDIDATES) break;
      }
    }
  }

  for (const item of historyItems.slice(0, 32)) {
    if (isRecommendableLocalItem(item, current.id)) map.set(item.id, item);
  }

  if (map.size < 120) {
    let added = 0;
    for (const item of mediaById.values()) {
      if (!isRecommendableLocalItem(item, current.id)) continue;
      if (map.has(item.id)) continue;
      if (item.kind === 'audio' && current.kind === 'video') continue;
      map.set(item.id, item);
      added++;
      if (added > 80 || map.size >= MAX_CANDIDATES) break;
    }
  }

  return [...map.values()];
}
