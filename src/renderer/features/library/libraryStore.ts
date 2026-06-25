import { startTransition } from 'react';
import type { MediaFilter, MediaItem, SortMode } from '../../../shared/types';
import { createStore } from '../../lib/createStore';
import { libraryPerfRecordStoreUpdate } from '../../lib/libraryPerf';
import { loadDurationCache } from '../../lib/durationCache';
import { readStored, STORAGE_KEYS } from '../../lib/storageKeys';
import { rebuildFolderIndex } from '../../lib/mediaIntelligence/mediaIdentityCache';
import { commitLibraryItems } from './libraryActions';
import type { LibraryBootState } from './libraryBootState';
import { initialLibraryState, type LibraryState } from './libraryTypes';

export const libraryStore = createStore<LibraryState>({
  ...initialLibraryState,
  filter: readStored<MediaFilter>(STORAGE_KEYS.libraryFilter, 'all'),
  sort: readStored<SortMode>(STORAGE_KEYS.librarySort, 'alphabetical'),
  durationById: loadDurationCache()
});

export function setLibraryLoading(loading: boolean): void {
  libraryStore.patch({ loading });
}

export function setLibraryBootState(boot: LibraryBootState): void {
  libraryStore.patch({ boot });
}

export function setLibraryCountsPending(countsPending: boolean): void {
  libraryStore.patch({ countsPending });
}

export function setLibraryBootError(bootError: string | null): void {
  libraryStore.patch({ bootError });
}

/** @deprecated Scan progress no longer patches library store (avoids full UI re-renders). */
export function touchLibraryScanProgress(_scanned: number, _added: number): void {
  // no-op — use libraryScanProgress.ts for stall detection
}

export function setLibraryScanning(scanning: boolean): void {
  libraryStore.patch({ scanning });
}

export function setLibraryScanError(scanError: string | null): void {
  libraryStore.patch({ scanError });
}

export function setLibraryQuery(query: string): void {
  libraryStore.patch({ query });
}

export function setLibraryFilter(filter: MediaFilter): void {
  libraryStore.patch({ filter });
  writeFilterPersist(filter);
}

export function setLibrarySort(sort: SortMode): void {
  libraryStore.patch({ sort });
  writeSortPersist(sort);
}

export function setLibraryFocusedRowId(focusedRowId?: string): void {
  libraryStore.patch({ focusedRowId });
}

export function setLibrarySelectedTitleId(selectedTitleId?: string): void {
  libraryStore.patch({
    selectedTitleId,
    ...(selectedTitleId ? { selectedFranchiseId: undefined } : {}),
  });
}

export function setLibrarySelectedFranchiseId(selectedFranchiseId?: string): void {
  libraryStore.patch({
    selectedFranchiseId,
    ...(selectedFranchiseId ? { selectedTitleId: undefined } : {}),
  });
}

export function patchDurationById(updates: Record<string, number>): void {
  libraryStore.setState((state) => ({
    ...state,
    durationById: { ...state.durationById, ...updates }
  }));
}

export function setDurationForMedia(mediaId: string, duration: number): void {
  libraryStore.setState((state) => ({
    ...state,
    durationById: { ...state.durationById, [mediaId]: duration }
  }));
}

export function commitLibraryToStore(
  items: MediaItem[],
  options?: { skipSort?: boolean; skipDurationSort?: boolean; skipFolderIndex?: boolean }
): MediaItem[] {
  libraryPerfRecordStoreUpdate();
  const { durationById } = libraryStore.getState();
  const { sorted, audio, video, durationSorted } = commitLibraryItems(items, durationById, {
    skipSort: options?.skipSort,
    skipDurationSort: options?.skipDurationSort,
  });
  if (!options?.skipFolderIndex) rebuildFolderIndex(sorted);
  startTransition(() => {
    libraryStore.patch({
      media: sorted,
      audioMedia: audio,
      videoMedia: video,
      mediaDurationSorted: durationSorted,
      scanError: null,
    });
  });
  return sorted;
}

export function rebuildLibraryDurationSorted(): void {
  const { media, durationById } = libraryStore.getState();
  const { durationSorted } = commitLibraryItems(media, durationById);
  libraryStore.patch({ mediaDurationSorted: durationSorted });
}

function writeFilterPersist(filter: MediaFilter): void {
  try {
    localStorage.setItem(STORAGE_KEYS.libraryFilter, JSON.stringify(filter));
  } catch {
    // ignore
  }
}

function writeSortPersist(sort: SortMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.librarySort, JSON.stringify(sort));
  } catch {
    // ignore
  }
}
