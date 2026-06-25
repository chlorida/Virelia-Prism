import type { MediaItem, SmartPlaylistRule } from '../../shared/types';

function topByAddedAt(media: MediaItem[], limit: number): string[] {
  if (media.length <= limit) {
    return media.slice().sort((left, right) => right.addedAt.localeCompare(left.addedAt)).map((item) => item.id);
  }
  const top: MediaItem[] = [];
  for (const item of media) {
    if (top.length < limit) {
      top.push(item);
      if (top.length === limit) top.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
      continue;
    }
    if (item.addedAt <= top[top.length - 1].addedAt) continue;
    top[top.length - 1] = item;
    top.sort((left, right) => right.addedAt.localeCompare(left.addedAt));
  }
  return top.map((item) => item.id);
}

function topByDuration(media: MediaItem[], limit: number, durationById?: Record<string, number>): string[] {
  const withDuration: MediaItem[] = [];
  for (const item of media) {
    const duration = durationById?.[item.id] ?? item.durationSeconds ?? 0;
    if (duration > 0) withDuration.push({ ...item, durationSeconds: duration });
  }
  if (withDuration.length <= limit) {
    return withDuration
      .sort((left, right) => (right.durationSeconds ?? 0) - (left.durationSeconds ?? 0))
      .map((item) => item.id);
  }
  const top = withDuration
    .sort((left, right) => (right.durationSeconds ?? 0) - (left.durationSeconds ?? 0))
    .slice(0, limit);
  return top.map((item) => item.id);
}

function topByLastPlayed(
  media: MediaItem[],
  playedAtById: Record<string, string>,
  limit: number
): string[] {
  const played: MediaItem[] = [];
  for (const item of media) {
    if (playedAtById[item.id]) played.push(item);
  }
  return played
    .sort((left, right) => (playedAtById[right.id] ?? '').localeCompare(playedAtById[left.id] ?? ''))
    .slice(0, limit)
    .map((item) => item.id);
}

export function resolveSmartPlaylistMediaIds(
  rule: SmartPlaylistRule,
  media: MediaItem[],
  favoriteIds: Set<string>,
  playedAtById: Record<string, string>,
  durationById?: Record<string, number>
): string[] {
  switch (rule.type) {
    case 'favorites': {
      const ids: string[] = [];
      for (const id of favoriteIds) ids.push(id);
      for (const item of media) {
        if (item.favorite && !favoriteIds.has(item.id)) ids.push(item.id);
      }
      return ids;
    }
    case 'recently-added':
      return topByAddedAt(media, 200);
    case 'longest-tracks':
      return topByDuration(media, 100, durationById);
    case 'unwatched-videos':
      return media
        .filter((item) => item.kind === 'video' && !playedAtById[item.id])
        .map((item) => item.id);
    case 'last-played':
      return topByLastPlayed(media, playedAtById, 100);
    default:
      return [];
  }
}
