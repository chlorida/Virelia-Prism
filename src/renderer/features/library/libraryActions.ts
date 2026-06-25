import type { MediaItem } from '../../../shared/types';
import { filterLibraryForShell } from '../../lib/initialLibrary';
import { indexMediaLibrary, sortMediaByDurationDesc } from '../../lib/mediaIndex';
import { sortMediaByTitle } from '../../lib/search';

export function splitMediaKinds(items: MediaItem[]): { audio: MediaItem[]; video: MediaItem[] } {
  const audio: MediaItem[] = [];
  const video: MediaItem[] = [];
  for (const item of items) {
    if (item.kind === 'audio') audio.push(item);
    else video.push(item);
  }
  return { audio, video };
}

export function mergeMediaItems(existing: MediaItem[], incoming: MediaItem[]): MediaItem[] {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const prior = map.get(item.id);
    map.set(item.id, prior ? {
      ...item,
      favorite: prior.favorite,
      durationSeconds: prior.durationSeconds ?? item.durationSeconds,
      lastPlayedAt: prior.lastPlayedAt ?? item.lastPlayedAt
    } : item);
  }
  return indexMediaLibrary(sortMediaByTitle(Array.from(map.values())));
}

export function applyScanMedia(existing: MediaItem[], incoming: MediaItem[]): MediaItem[] {
  return mergeMediaItems(existing, filterLibraryForShell(incoming));
}

export function rebuildDurationSorted(
  items: MediaItem[],
  durationById: Record<string, number>
): MediaItem[] {
  const merged = items.map((item) => ({
    ...item,
    durationSeconds: durationById[item.id] ?? item.durationSeconds
  }));
  return sortMediaByDurationDesc(merged);
}

export function commitLibraryItems(
  items: MediaItem[],
  durationById: Record<string, number>,
  options?: { skipSort?: boolean; skipDurationSort?: boolean }
): { sorted: MediaItem[]; audio: MediaItem[]; video: MediaItem[]; durationSorted: MediaItem[] } {
  const base = options?.skipSort ? items : sortMediaByTitle(items);
  const sorted = indexMediaLibrary(base);
  const { audio, video } = splitMediaKinds(sorted);
  const durationSorted = options?.skipDurationSort
    ? sorted.filter((item) => (item.durationSeconds ?? durationById[item.id] ?? 0) > 0)
    : rebuildDurationSorted(sorted, durationById);
  return { sorted, audio, video, durationSorted };
}
