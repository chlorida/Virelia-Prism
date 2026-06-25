import { startTransition } from 'react';
import type { LibraryScanResult } from '../../../shared/types';
import { filterLibraryForShell } from '../../lib/initialLibrary';
import { getPrism } from '../../lib/prismApi';
import { isTauriShell } from '../../lib/prismAdapter';
import { LibraryToastCoordinator } from '../../lib/libraryToast';
import { computeLibraryCounts } from '../../lib/libraryStats';
import { playUiSound } from '../../services/uiAudioService';
import { applyScanMedia, commitLibraryItems } from './libraryActions';
import {
  libraryStore,
  setLibraryBootState,
  setLibraryCountsPending,
  setLibraryLoading,
  setLibraryScanError,
  setLibraryScanning,
} from './libraryStore';
import { loadSettingsFromShell } from '../settings/settingsStore';
import { pruneQueueAgainstMedia } from '../queue/queueStore';
import { libraryBootLog } from './libraryBootLog';
import { rebuildFolderIndex } from '../../lib/mediaIntelligence/mediaIdentityCache';
import { libraryPerfRecordStoreUpdate } from '../../lib/libraryPerf';
import { clearLibrarySnapshot, saveLibrarySnapshot } from '../../lib/tauriCommands';
import { scheduleBackgroundLibraryRescan } from './libraryBootstrap';

const libraryToast = new LibraryToastCoordinator();

type ScanToastKey = 'toast.libraryScanning' | 'toast.libraryUpdated' | 'toast.dropFailed';

export async function absorbLibraryScan(
  result: LibraryScanResult,
  options?: {
    notify?: boolean;
    background?: boolean;
    showToast?: (text: string, options?: import('../../components/ToastStack').ToastOptions | number) => void;
    t?: (key: ScanToastKey) => string;
  }
): Promise<void> {
  const toast = options?.showToast;
  const translate = options?.t;
  const background = options?.background ?? isTauriShell();

  if (options?.notify && toast && translate) {
    libraryToast.begin(toast, translate('toast.libraryScanning'));
  }

  if (background) {
    setLibraryScanning(true);
  } else {
    setLibraryLoading(true);
  }

  try {
    await loadSettingsFromShell();
    const prior = libraryStore.getState().media;
    const merged = applyScanMedia(prior, result.media);
    const { durationById } = libraryStore.getState();
    const finalized = commitLibraryItems(merged, durationById);
    rebuildFolderIndex(finalized.sorted);
    libraryPerfRecordStoreUpdate();
    startTransition(() => {
      libraryStore.patch({
        media: finalized.sorted,
        audioMedia: finalized.audio,
        videoMedia: finalized.video,
        mediaDurationSorted: finalized.durationSorted,
        snapshotCounts: computeLibraryCounts(finalized.sorted, {}),
        countsPending: false,
      });
    });
    pruneQueueAgainstMedia(finalized.sorted);
    setLibraryBootState('ready');

    if (isTauriShell() && finalized.sorted.length > 0) {
      try {
        await saveLibrarySnapshot();
        libraryBootLog('snapshot saved after absorb', { items: finalized.sorted.length });
      } catch (error) {
        libraryBootLog('snapshot save failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (options?.notify && toast && translate) {
      libraryToast.finish(toast, translate('toast.libraryUpdated'));
    }
  } catch {
    setLibraryScanError('scan_failed');
    setLibraryBootState('scanFailed');
    if (options?.notify && toast && translate) {
      libraryToast.fail(toast, translate('toast.dropFailed'));
    }
  } finally {
    if (background) {
      setLibraryScanning(false);
    } else {
      setLibraryLoading(false);
    }
    setLibraryCountsPending(false);
  }
}

export async function importLibraryFolder(
  showToast: (text: string, options?: import('../../components/ToastStack').ToastOptions | number) => void,
  t: (key: string, params?: Record<string, string | number>) => string
): Promise<void> {
  const prism = getPrism();
  if (!prism) return;
  try {
    const result = await prism.library.chooseFolder();
    if (!result) return;
    if (result.folderAlreadyIndexed) {
      playUiSound('warning');
      showToast(t('toast.folderAlreadyIndexed'), { key: 'folder-import', durationMs: 3000 });
      return;
    }
    if (result.media.length === 0) {
      showToast(t('toast.folderEmpty'));
      return;
    }
    await absorbLibraryScan(result, { background: false, notify: true, showToast, t: t as (key: ScanToastKey) => string });
    playUiSound('success');
    showToast(t('toast.folderAdded', { count: result.media.length }), { key: 'folder-import', durationMs: 3000 });
  } catch {
    playUiSound('error');
    showToast(t('toast.dropFailed'));
  }
}

export async function retryLibraryScan(
  showToast: (text: string, options?: import('../../components/ToastStack').ToastOptions | number) => void,
  t: (key: string) => string
): Promise<void> {
  const settings = await loadSettingsFromShell();
  if (settings.libraryFolders.length === 0) {
    showToast(t('toast.noFolders'));
    return;
  }
  scheduleBackgroundLibraryRescan(
    settings.libraryFolders,
    (scan) => {
      void absorbLibraryScan(scan, { background: true, notify: true, showToast, t: t as (key: ScanToastKey) => string });
    },
    () => showToast(t('toast.dropFailed')),
    { force: true }
  );
}

export async function resetLibraryIndex(
  showToast: (text: string, options?: import('../../components/ToastStack').ToastOptions | number) => void,
  t: (key: string) => string
): Promise<void> {
  if (isTauriShell()) {
    try {
      await clearLibrarySnapshot();
    } catch {
      // ignore
    }
  }
  libraryStore.patch({
    media: [],
    audioMedia: [],
    videoMedia: [],
    mediaDurationSorted: [],
    snapshotCounts: null,
    countsPending: true,
    scanError: null,
  });
  setLibraryBootState('scanning');
  showToast(t('library.recovery.rebuilding'));
  await retryLibraryScan(showToast, t);
}
