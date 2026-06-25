import type { MediaItem } from '../../../shared/types';
import type { LibraryTitle } from './types';
import { findLibraryEpisodeByItemId } from './libraryTitleService';
import { parseMediaIdentity } from './episodeParser';
import { pickBestVersionItem } from './episodeVersionService';

export { pickBestVersionItem } from './episodeVersionService';

export interface TitlePlayTarget {
  item: MediaItem;
  mode: 'continue' | 'start' | 'episode';
}

function isMostlyWatched(item: MediaItem): boolean {
  if (!item.durationSeconds || !item.resumePositionSeconds) return false;
  return item.resumePositionSeconds / item.durationSeconds > 0.92;
}

function findContinueItem(title: LibraryTitle): MediaItem | undefined {
  const candidates = title.items.filter(
    (item) => (item.resumePositionSeconds ?? 0) > 30 && !isMostlyWatched(item)
  );
  if (candidates.length === 0) return undefined;
  return candidates.sort(
    (a, b) => (b.resumePositionSeconds ?? 0) - (a.resumePositionSeconds ?? 0)
  )[0];
}

function findFirstEpisodeItem(title: LibraryTitle): MediaItem | undefined {
  if (title.episodes && title.episodes.length > 0) {
    const sorted = [...title.episodes].sort((a, b) => {
      const sa = a.seasonNumber ?? 0;
      const sb = b.seasonNumber ?? 0;
      if (sa !== sb) return sa - sb;
      return (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999);
    });
    const first = sorted.find((ep) => ep.episodeNumber != null) ?? sorted[0];
    if (first?.preferredItemId) {
      return title.items.find((item) => item.id === first.preferredItemId);
    }
  }
  if (title.preferredItemId) {
    return title.items.find((item) => item.id === title.preferredItemId);
  }
  return pickBestVersionItem(title.items);
}

export function resolveEpisodePlayItem(title: LibraryTitle, episodeId: string): MediaItem | undefined {
  const episode = title.episodes?.find((ep) => ep.id === episodeId);
  if (!episode) return undefined;
  if (episode.preferredItemId) {
    return title.items.find((item) => item.id === episode.preferredItemId);
  }
  const versionItems = episode.versions
    .map((v) => title.items.find((item) => item.id === v.itemId))
    .filter((item): item is MediaItem => Boolean(item));
  return pickBestVersionItem(versionItems);
}

export function resolveNextEpisodePlayItem(
  title: LibraryTitle,
  currentItemId?: string
): MediaItem | undefined {
  if (!currentItemId) return undefined;

  const currentEpisode = findLibraryEpisodeByItemId(title, currentItemId);
  if (currentEpisode?.episodeNumber != null) {
    const nextEpisode = [...(title.episodes ?? [])]
      .filter((ep) => ep.episodeNumber != null && ep.episodeNumber > currentEpisode.episodeNumber!)
      .sort((a, b) => (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999))[0];
    if (nextEpisode) {
      return resolveEpisodePlayItem(title, nextEpisode.id);
    }
    return undefined;
  }

  const current = title.items.find((item) => item.id === currentItemId);
  if (!current) return undefined;
  const parsed = parseMediaIdentity(current.title, current.fileName);
  if (parsed.episodeNumber == null) return undefined;

  const folderVideos = title.items.filter((item) => item.kind === 'video');
  const nextNum = parsed.episodeNumber + 1;
  const padded = String(nextNum).padStart(2, '0');
  return folderVideos.find((item) => {
    const identity = parseMediaIdentity(item.title, item.fileName);
    if (identity.episodeNumber === nextNum) return true;
    return item.fileName.includes(`[${padded}]`) || item.fileName.includes(`[${nextNum}]`);
  });
}

export function resolveTitlePlayTarget(
  title: LibraryTitle,
  episodeItemId?: string
): TitlePlayTarget | undefined {
  if (episodeItemId) {
    const episode = findLibraryEpisodeByItemId(title, episodeItemId);
    if (episode) {
      const item = resolveEpisodePlayItem(title, episode.id);
      if (item) return { item, mode: 'episode' };
    }
    const item = title.items.find((row) => row.id === episodeItemId);
    if (item) return { item, mode: 'episode' };
  }

  const continueItem = findContinueItem(title);
  if (continueItem) return { item: continueItem, mode: 'continue' };

  const startItem = findFirstEpisodeItem(title);
  if (!startItem) return undefined;
  return { item: startItem, mode: 'start' };
}

export function getTitleProgressSummary(title: LibraryTitle): {
  hasProgress: boolean;
  continueItem?: MediaItem;
  watchedCount: number;
} {
  const continueItem = findContinueItem(title);
  const watchedCount = title.items.filter((item) => isMostlyWatched(item)).length;
  return {
    hasProgress: Boolean(continueItem),
    continueItem,
    watchedCount,
  };
}
