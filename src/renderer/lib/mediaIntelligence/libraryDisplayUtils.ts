import type { FranchiseTitleView } from './franchise/franchiseService';
import type { FranchiseWatchOrderMode } from './franchise/franchiseCatalog';
import type { LibraryTitle } from './types';
import { getTitleProgressSummary } from './titlePlaybackService';
import { getNumberedEpisodeCount } from './titleDisplayUtils';
import type { EnrichedTitleMetadata } from '../../../shared/titleMetadataTypes';

import type { TranslationKey } from '../../../shared/i18n';
type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function formatFranchiseTypeSummary(types: string[]): string {
  const labels = [...new Set(types.map((type) => {
    if (type === 'ova') return 'OVA';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }))];
  return labels.join(' · ');
}

export function formatFranchiseLibraryProgress(local: number, total: number, t: TFn): string {
  return t('media.library.franchiseProgress', { local, total });
}

export function formatLocalItemCount(
  title: LibraryTitle | undefined,
  t: TFn
): string | undefined {
  if (!title) return undefined;
  const episodes = title.uniqueEpisodeCount;
  const files = title.totalFileCount;

  if (title.mediaType === 'series' && episodes > 1) {
    return episodes === 1
      ? t('media.library.oneEpisodeFound')
      : t('media.library.episodesFound', { count: episodes });
  }

  if (files <= 0) return undefined;
  return files === 1
    ? t('media.library.oneFileFound')
    : t('media.library.filesFound', { count: files });
}

/** Local vs catalog episode counts for hero display (e.g. 15/15). */
export function resolveLibraryEpisodeProgress(
  title: LibraryTitle | undefined,
  enriched: EnrichedTitleMetadata | undefined,
): { local: number; total: number } | null {
  if (!title) return null;

  const totalEpisodes = enriched?.episodeCount;
  const numberedLocal = getNumberedEpisodeCount(title);
  const localEpisodes = title.uniqueEpisodeCount > 0 ? title.uniqueEpisodeCount : numberedLocal;
  const localUnits = localEpisodes > 0 ? localEpisodes : title.totalFileCount;

  if (totalEpisodes != null && totalEpisodes > 0 && localUnits > 0) {
    return { local: localUnits, total: totalEpisodes };
  }

  if (title.mediaType === 'series' && localEpisodes > 0) {
    return { local: localEpisodes, total: localEpisodes };
  }

  return null;
}

/** Local library count vs total episodes from online metadata (e.g. 24/26). */
export function formatLibraryEpisodeProgress(
  title: LibraryTitle | undefined,
  enriched: EnrichedTitleMetadata | undefined,
  t: TFn
): string | undefined {
  const progress = resolveLibraryEpisodeProgress(title, enriched);
  if (progress) {
    return t('media.library.episodesProgress', { local: progress.local, total: progress.total });
  }

  if (!title) return undefined;

  const numberedLocal = getNumberedEpisodeCount(title);
  const localEpisodes = title.uniqueEpisodeCount > 0 ? title.uniqueEpisodeCount : numberedLocal;

  if (title.mediaType === 'series' && localEpisodes > 0) {
    return localEpisodes === 1
      ? t('media.library.oneEpisodeFound')
      : t('media.library.episodesFound', { count: localEpisodes });
  }

  return formatLocalItemCount(title, t);
}

export function formatTimelineCount(entry: FranchiseTitleView, t: TFn): string | undefined {
  if (!entry.inLibrary || !entry.localTitle) return undefined;
  return formatLocalItemCount(entry.localTitle, t);
}

export function resolveFranchiseStartLabel(
  hasLocal: boolean,
  hasProgress: boolean,
  t: TFn
): string {
  if (!hasLocal) return t('media.franchise.findFirstOnline');
  if (hasProgress) return t('media.franchise.continueFranchise');
  return t('media.franchise.startFromFirst');
}

export function resolveLocalPlayLabel(title: LibraryTitle, t: TFn): string {
  const progress = getTitleProgressSummary(title);
  const isAlbum = title.mediaType === 'album'
    || (title.items.length > 0 && title.items.every((item) => item.kind === 'audio'));
  if (progress.continueItem) {
    return isAlbum ? t('media.library.continueListening') : t('media.titles.continueWatching');
  }
  if (isAlbum) return t('player.play');
  if (title.mediaType === 'series' && (title.uniqueEpisodeCount ?? 0) > 1) {
    return t('media.library.startSeries');
  }
  return t('media.titles.startWatching');
}

export function resolveTimelinePlayLabel(entry: FranchiseTitleView, t: TFn): string {
  if (!entry.inLibrary || !entry.localTitle) return t('catalog.openDetails');
  const progress = getTitleProgressSummary(entry.localTitle);
  if (progress.continueItem) return t('media.titles.continueWatching');
  if (entry.localTitle.mediaType === 'movie' || entry.localTitle.mediaType === 'ova') {
    return t('media.titles.startWatching');
  }
  return t('media.library.startSeries');
}

export function orderModeUsesFallback(
  mode: FranchiseWatchOrderMode,
  entries: FranchiseTitleView[]
): boolean {
  if (mode === 'release') return false;
  return entries.some((entry) => {
    const catalog = entry.catalogTitle;
    const modeIndex = mode === 'recommended'
      ? catalog.recommendedOrderIndex
      : catalog.chronologicalOrderIndex;
    return modeIndex === catalog.releaseOrderIndex;
  });
}

export function timelinePositionNote(
  entry: FranchiseTitleView,
  index: number,
  entries: FranchiseTitleView[],
  orderMode: FranchiseWatchOrderMode,
  t: TFn
): string | undefined {
  if (orderMode !== 'chronological' || index === 0) return undefined;
  const prev = entries[index - 1];
  if (!prev) return undefined;
  if (entry.orderIndex === prev.orderIndex) return t('media.franchise.timelineEstimated');
  return t('media.franchise.timelineAfter', { title: prev.catalogTitle.displayTitle });
}
