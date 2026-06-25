import { createStore } from '../../lib/createStore';
import type { WhisperModelSize } from '../../../shared/subtitleTypes';
import type { DownloadItem } from './downloadTypes';
import { isActiveDownloadStatus } from './downloadTypes';

export interface DownloadStoreState {
  items: Record<string, DownloadItem>;
  installedWhisperModels: WhisperModelSize[];
  serviceReady: boolean;
}

export const downloadStore = createStore<DownloadStoreState>({
  items: {},
  installedWhisperModels: [],
  serviceReady: false,
});

export function patchDownloadItem(id: string, patch: Partial<DownloadItem>): void {
  const { items } = downloadStore.getState();
  const current = items[id];
  if (!current) return;
  downloadStore.patch({
    items: {
      ...items,
      [id]: { ...current, ...patch },
    },
  });
}

export function upsertDownloadItem(item: DownloadItem): void {
  const { items } = downloadStore.getState();
  downloadStore.patch({
    items: {
      ...items,
      [item.id]: item,
    },
  });
}

export function selectActiveDownloads(state: DownloadStoreState): DownloadItem[] {
  return Object.values(state.items).filter((item) => isActiveDownloadStatus(item.status));
}

export function selectRecentDownloads(state: DownloadStoreState): DownloadItem[] {
  return Object.values(state.items)
    .filter((item) => item.status === 'complete' || item.status === 'failed' || item.status === 'cancelled')
    .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt));
}

export function selectAggregateDownloadProgress(state: DownloadStoreState): number {
  const active = selectActiveDownloads(state);
  if (active.length === 0) return 0;
  const total = active.reduce((sum, item) => sum + item.progress, 0);
  return total / active.length;
}
