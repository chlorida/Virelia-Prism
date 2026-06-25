import type { MediaItem } from '../../shared/types';

export const MAX_PLAYBACK_HISTORY = 50;

export function appendPlaybackHistory(history: string[], mediaId: string, max = MAX_PLAYBACK_HISTORY): string[] {
  return [mediaId, ...history.filter((id) => id !== mediaId)].slice(0, max);
}

export function resolveHistoryMedia(history: string[], media: MediaItem[]): MediaItem[] {
  const byId = new Map(media.map((item) => [item.id, item]));
  return history
    .map((id) => byId.get(id))
    .filter((item): item is MediaItem => Boolean(item));
}
