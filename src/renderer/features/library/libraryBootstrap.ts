import { startTransition } from 'react';
import { demoQueue } from '../../../shared/defaults';
import type { AppSettings, LibraryScanResult, MediaItem, QueueItem } from '../../../shared/types';
import { resolveBootstrapLibrary } from '../../lib/initialLibrary';
import { indexMediaLibrary, scheduleBackgroundSearchIndex } from '../../lib/mediaIndex';
import { pruneQueueToMedia } from '../../lib/mediaMetadata';
import { getPrism } from '../../lib/prismApi';
import { isTauriShell } from '../../lib/prismAdapter';
import { onScanProgress } from '../../lib/tauriCommands';
import { loadSettingsFromShell } from '../settings/settingsStore';
import { readStored, STORAGE_KEYS } from '../../lib/storageKeys';
import { perfMark, perfMeasure } from '../../lib/perf';
import {
  libraryPerfDump,
  libraryPerfRecordStoreUpdate,
  libraryPerfReset,
  libraryPerfSetIndexReadMs,
  libraryPerfSetScanTraversalMs,
} from '../../lib/libraryPerf';
import {
  getLastLibraryScanProgressAt,
  noteLibraryScanProgressPayload,
  resetLibraryScanProgressClock,
} from '../../lib/libraryScanProgress';
import {
  perfMarkCachedCountsVisible,
  perfMarkFirstLibraryRows,
  perfMarkScanComplete,
  perfMarkScanStart,
  perfMarkSnapshotLoaded,
  perfMarkUsableUI,
} from '../../lib/perfReport';
import {
  invalidateIdentityCache,
  rebuildFolderIndex,
  scheduleDeferredFolderIndex,
  scheduleIdentityWarm,
} from '../../lib/mediaIntelligence/mediaIdentityCache';
import { computeLibraryCounts } from '../../lib/libraryStats';
import { commitLibraryItems } from './libraryActions';
import {
  libraryStore,
  setLibraryBootError,
  setLibraryBootState,
  setLibraryCountsPending,
  setLibraryLoading,
  setLibraryScanning,
} from './libraryStore';
import type { LibraryCounts } from '../../lib/libraryStats';
import { setQueueItems } from '../queue/queueStore';
import { libraryBootLog, logLibraryBootPaths } from './libraryBootLog';
import type { LibraryBootState } from './libraryBootState';
import { getLibrary, saveLibrarySnapshot } from '../../lib/tauriCommands';
import { buildLibraryTitles } from '../../lib/mediaIntelligence/libraryTitleService';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import { isAudioOnlyLibraryTitle } from '../../lib/mediaIntelligence/audioAlbumService';
import { hydrateTitleMetadataFromDisk } from '../../lib/mediaIntelligence/metadata/titleMetadataService';
import {
  isSearchIndexWarmNeeded,
  shouldScheduleBackgroundRescan,
} from './libraryCachePolicy';

function scheduleDeferredMetadataHydration(titles: LibraryTitle[]): void {
  const eligible = titles.filter((title) => !isAudioOnlyLibraryTitle(title));
  if (eligible.length === 0) return;

  const run = () => {
    void hydrateTitleMetadataFromDisk(eligible);
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    globalThis.setTimeout(run, 64);
  }
}
const SCAN_STALL_MS = 30_000;
const SCAN_HARD_TIMEOUT_MS = 20 * 60_000;

function countsFromMedia(media: MediaItem[]): LibraryCounts {
  return computeLibraryCounts(media, {});
}

function applySnapshotCounts(snapshot?: LibraryCounts): void {
  if (!snapshot) return;
  libraryStore.patch({
    snapshotCounts: {
      all: snapshot.all,
      audio: snapshot.audio,
      video: snapshot.video,
      favorites: libraryStore.getState().snapshotCounts?.favorites ?? 0,
      recent: libraryStore.getState().snapshotCounts?.recent ?? 0,
    },
    countsPending: false,
  });
  perfMarkCachedCountsVisible();
}

function applyLibraryToStore(
  libraryItems: MediaItem[],
  snapshot?: LibraryCounts,
  options?: { warmCache?: boolean }
): MediaItem[] {
  const { durationById } = libraryStore.getState();
  const { sorted, audio, video, durationSorted } = commitLibraryItems(libraryItems, durationById, {
    skipSort: true,
    skipDurationSort: options?.warmCache,
  });
  if (options?.warmCache) scheduleDeferredFolderIndex(sorted);
  else rebuildFolderIndex(sorted);
  const snapshotCounts = snapshot ?? countsFromMedia(sorted);
  const initialQueue = sorted.length > 0 && sorted[0]?.filePath
    ? readStored<QueueItem[]>(STORAGE_KEYS.queue, demoQueue)
    : readStored<QueueItem[]>(STORAGE_KEYS.queue, []);

  startTransition(() => {
    libraryStore.patch({
      media: sorted,
      audioMedia: audio,
      videoMedia: video,
      mediaDurationSorted: durationSorted,
      scanError: null,
      snapshotCounts: snapshotCounts,
      countsPending: false,
    });
    setQueueItems(pruneQueueToMedia(initialQueue, sorted));
  });
  return sorted;
}

function scheduleDeferredAlphabeticalSort(rawItems: MediaItem[]): void {
  const run = () => {
    const { durationById } = libraryStore.getState();
    const { sorted, audio, video, durationSorted } = commitLibraryItems(rawItems, durationById);
    startTransition(() => {
      libraryStore.patch({
        media: sorted,
        audioMedia: audio,
        videoMedia: video,
        mediaDurationSorted: durationSorted,
      });
    });
    rebuildFolderIndex(sorted);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    globalThis.setTimeout(run, 16);
  }
}

function scheduleSearchIndexWarm(sorted: MediaItem[]): void {
  if (!isSearchIndexWarmNeeded(sorted)) {
    libraryBootLog('search index warm skipped', { items: sorted.length });
    return;
  }
  scheduleBackgroundSearchIndex(sorted, (indexed) => {
    const { durationById } = libraryStore.getState();
    const { sorted: nextSorted, audio, video, durationSorted } = commitLibraryItems(indexed, durationById, {
      skipSort: true,
    });
    libraryPerfRecordStoreUpdate();
    startTransition(() => {
      libraryStore.patch({
        media: nextSorted,
        audioMedia: audio,
        videoMedia: video,
        mediaDurationSorted: durationSorted,
      });
    });
    if (isTauriShell() && nextSorted.length > 0) {
      void saveLibrarySnapshot().catch((error) => {
        libraryBootLog('snapshot save after search warm failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  });
}

async function loadSnapshotFromShell(
  folders: string[]
): Promise<{ media: MediaItem[]; counts?: LibraryCounts; source: string; scannedAt?: string } | null> {
  const prism = getPrism();
  if (!prism) return null;

  libraryBootLog('snapshot read start', { folders: folders.length });
  const indexReadStart = performance.now();
  try {
    const cached = await prism.library.loadCached(folders);
    libraryPerfSetIndexReadMs(performance.now() - indexReadStart);
    if (cached && cached.media.length > 0) {
      libraryBootLog('snapshot read ok', {
        items: cached.media.length,
        source: (cached as { source?: string }).source ?? 'disk',
        countsAll: cached.counts?.all ?? cached.media.length,
      });
      return {
        media: cached.media,
        counts: cached.counts
          ? { ...cached.counts, favorites: 0, recent: 0 }
          : undefined,
        source: 'disk',
        scannedAt: cached.scannedAt,
      };
    }
    libraryBootLog('snapshot read empty');
  } catch (error) {
    libraryBootLog('snapshot read failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (isTauriShell()) {
    try {
      const memory = await getLibrary();
      if (memory.length > 0) {
        libraryBootLog('fallback used', { source: 'memory', items: memory.length });
        return { media: memory, source: 'memory' };
      }
    } catch (error) {
      libraryBootLog('memory fallback failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

function transitionBoot(state: LibraryBootState): void {
  setLibraryBootState(state);
  libraryBootLog('loadingState', { state });
}

export async function bootstrapLibraryFromSettings(
  loadedSettings: AppSettings
): Promise<{ sorted: MediaItem[]; usedCache: boolean; folders: string[]; scannedAt?: string }> {
  const prism = getPrism();
  if (!prism) throw new Error('Desktop API unavailable');

  perfMark('library-bootstrap-start');
  libraryPerfReset();
  resetLibraryScanProgressClock();
  await logLibraryBootPaths();

  const folders = loadedSettings.libraryFolders;
  libraryBootLog('indexedFolders loaded', { count: folders.length });

  let libraryItems: MediaItem[] = [];
  let usedCache = false;
  let rawForSort: MediaItem[] = [];
  let snapshotCounts: LibraryCounts | undefined;
  let scannedAt: string | undefined;

  if (folders.length > 0) {
    setLibraryCountsPending(true);
    transitionBoot('loadingSnapshot');

    const snapshot = await loadSnapshotFromShell(folders);
    if (snapshot && snapshot.media.length > 0) {
      transitionBoot('snapshotReady');
      perfMark('library-cache-hit');
      perfMarkSnapshotLoaded();
      snapshotCounts = snapshot.counts ?? countsFromMedia(snapshot.media);
      scannedAt = snapshot.scannedAt;
      applySnapshotCounts(snapshotCounts);
      rawForSort = snapshot.media;
      libraryItems = indexMediaLibrary(snapshot.media);
      usedCache = true;
      libraryBootLog('hydrate store start', { items: libraryItems.length });
      transitionBoot('hydratingStore');
    } else {
      transitionBoot('snapshotFailed');
      libraryBootLog('snapshot unavailable; will scan in background', { folders: folders.length });
      setLibraryCountsPending(true);
      libraryItems = [];
    }
  } else {
    transitionBoot('empty');
    libraryItems = indexMediaLibrary(resolveBootstrapLibrary([], []));
    setLibraryCountsPending(false);
  }

  if (!usedCache) invalidateIdentityCache();

  transitionBoot(usedCache ? 'hydratingStore' : folders.length > 0 ? 'scanning' : 'empty');
  const sorted = applyLibraryToStore(libraryItems, snapshotCounts, { warmCache: usedCache });
  libraryBootLog('hydrate store ok', { items: sorted.length });
  if (sorted.length > 0) {
    scheduleDeferredMetadataHydration(buildLibraryTitles(sorted));
  }

  if (sorted.length > 0) {
    transitionBoot(usedCache ? 'readyFromSnapshot' : 'ready');
    perfMarkFirstLibraryRows();
    perfMarkUsableUI();
    setLibraryLoading(false);
  } else if (folders.length > 0) {
    transitionBoot('scanning');
    setLibraryCountsPending(true);
  } else {
    transitionBoot('empty');
    setLibraryCountsPending(false);
    setLibraryLoading(false);
  }

  scheduleIdentityWarm(sorted, { currentId: undefined, limit: 48 });
  scheduleSearchIndexWarm(sorted);
  if (usedCache && rawForSort.length > 0) {
    scheduleDeferredAlphabeticalSort(rawForSort);
  }

  perfMeasure('library-bootstrap', 'library-bootstrap-start');
  return { sorted, usedCache, folders, scannedAt };
}

let activeScanAbort: AbortController | null = null;

export function scheduleBackgroundLibraryRescan(
  folders: string[],
  onComplete: (result: LibraryScanResult) => void,
  onError?: (error: string) => void,
  options?: { force?: boolean; usedCache?: boolean; scannedAt?: string }
): void {
  const prism = getPrism();
  if (!prism || folders.length === 0) return;

  if (
    !shouldScheduleBackgroundRescan({
      usedCache: options?.usedCache ?? false,
      scannedAt: options?.scannedAt,
      force: options?.force,
    })
  ) {
    libraryBootLog('background rescan skipped', { scannedAt: options?.scannedAt });
    return;
  }

  activeScanAbort?.abort();
  const abort = new AbortController();
  activeScanAbort = abort;

  const priorBoot = libraryStore.getState().boot;
  const nextBoot: LibraryBootState =
    priorBoot === 'readyFromSnapshot' || priorBoot === 'readyAndScanning'
      ? 'readyAndScanning'
      : 'scanning';
  transitionBoot(nextBoot);
  setLibraryScanning(true);
  perfMarkScanStart();
  libraryBootLog('scan start', { folders: folders.length });

  const stallTimer = globalThis.setInterval(() => {
    const { scanning } = libraryStore.getState();
    if (!scanning) return;
    const lastScanProgressAt = getLastLibraryScanProgressAt();
    if (lastScanProgressAt && Date.now() - lastScanProgressAt > SCAN_STALL_MS) {
      libraryBootLog('scan stall detected', { ms: SCAN_STALL_MS });
      setLibraryBootError('scan_stall');
    }
  }, 5000);

  const hardTimeout = globalThis.setTimeout(() => {
    if (!abort.signal.aborted) {
      libraryBootLog('scan timeout', { ms: SCAN_HARD_TIMEOUT_MS });
      abort.abort();
      setLibraryBootError('scan_timeout');
      onError?.('scan_timeout');
    }
  }, SCAN_HARD_TIMEOUT_MS);

  void (async () => {
    try {
      const scanStarted = performance.now();
      const scan = await prism.library.scan(folders);
      libraryPerfSetScanTraversalMs(performance.now() - scanStarted);
      if (abort.signal.aborted) return;
      libraryBootLog('scan done', { items: scan.media.length });
      onComplete(scan);
      if (isTauriShell() && scan.media.length > 0) {
        try {
          await saveLibrarySnapshot();
          libraryBootLog('snapshot write ok', { items: scan.media.length });
        } catch (error) {
          libraryBootLog('snapshot write failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      transitionBoot('ready');
      setLibraryBootError(null);
    } catch (error) {
      if (abort.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      libraryBootLog('scan failed', { error: message });
      transitionBoot('scanFailed');
      setLibraryBootError(message);
      onError?.(message);
    } finally {
      globalThis.clearInterval(stallTimer);
      globalThis.clearTimeout(hardTimeout);
      perfMarkScanComplete();
      libraryPerfDump('background-scan');
      setLibraryScanning(false);
      setLibraryLoading(false);
      setLibraryCountsPending(false);
      if (activeScanAbort === abort) activeScanAbort = null;
    }
  })();
}

export function registerLibraryScanProgressBridge(): void {
  if (!isTauriShell()) return;
  void onScanProgress((payload) => {
    noteLibraryScanProgressPayload(payload);
    if (payload.scanned % 2000 === 0 || payload.done) {
      libraryBootLog('scan progress', {
        scanned: payload.scanned,
        added: payload.added,
        done: payload.done,
      });
    }
  });
}

export async function runLibraryBootstrap(): Promise<{
  settings: AppSettings;
  libraryItems: MediaItem[];
  usedCache: boolean;
  folders: string[];
  scannedAt?: string;
}> {
  registerLibraryScanProgressBridge();

  setLibraryBootError(null);
  transitionBoot('idle');

  const settings = await loadSettingsFromShell();
  const hasFolders = settings.libraryFolders.length > 0;

  if (hasFolders) {
    setLibraryCountsPending(true);
  }

  try {
    const result = await bootstrapLibraryFromSettings(settings);
    return {
      settings,
      libraryItems: result.sorted,
      usedCache: result.usedCache,
      folders: result.folders,
      scannedAt: result.scannedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    libraryBootLog('bootstrap fatal', { error: message });
    transitionBoot('fatalError');
    setLibraryBootError(message);
    throw error;
  } finally {
    setLibraryLoading(false);
    const { media, boot, scanning } = libraryStore.getState();
    if (boot !== 'fatalError' && boot !== 'scanFailed') {
      if (media.length > 0) {
        transitionBoot(scanning ? 'readyAndScanning' : 'ready');
      } else if (settings.libraryFolders.length > 0) {
        transitionBoot(scanning ? 'scanning' : 'snapshotFailed');
      }
    }
  }
}
