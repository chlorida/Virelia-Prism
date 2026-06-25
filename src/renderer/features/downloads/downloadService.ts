import type { WhisperModelSize } from '../../../shared/subtitleTypes';
import {
  cancelWhisperModelDownload,
  deleteWhisperModel,
  downloadWhisperModel,
  listWhisperModels,
  onSetupDownloadProgress,
  type SetupDownloadProgress,
} from '../../lib/tauriCommands';
import {
  downloadStore,
  patchDownloadItem,
  upsertDownloadItem,
} from './downloadStore';
import {
  WHISPER_MODEL_META,
  whisperDownloadId,
  type DownloadItem,
} from './downloadTypes';

let progressUnlisten: (() => void) | null = null;
let initPromise: Promise<void> | null = null;

function whisperLabel(modelId: WhisperModelSize): string {
  return WHISPER_MODEL_META[modelId as keyof typeof WHISPER_MODEL_META]?.label ?? `Whisper ${modelId}`;
}

function applyProgress(progress: SetupDownloadProgress): void {
  const id = whisperDownloadId(progress.modelId);
  const { items } = downloadStore.getState();
  const existing = items[id];
  const base: DownloadItem = existing ?? {
    id,
    kind: 'whisper-model',
    label: whisperLabel(progress.modelId),
    modelId: progress.modelId,
    progress: 0,
    downloadedBytes: 0,
    status: 'starting',
    startedAt: Date.now(),
  };

  const status =
    progress.status === 'complete'
      ? 'complete'
      : progress.status === 'cancelled'
        ? 'cancelled'
        : progress.status === 'starting'
          ? 'starting'
          : 'downloading';

  upsertDownloadItem({
    ...base,
    progress: progress.progress,
    downloadedBytes: progress.downloadedBytes,
    totalBytes: progress.totalBytes,
    status,
    completedAt:
      status === 'complete' || status === 'cancelled'
        ? Date.now()
        : base.completedAt,
  });

  if (status === 'complete') {
    void refreshInstalledWhisperModels();
  }
}

export async function refreshInstalledWhisperModels(): Promise<void> {
  try {
    const installed = await listWhisperModels();
    downloadStore.patch({
      installedWhisperModels: installed as WhisperModelSize[],
    });
  } catch {
    // Non-fatal — offline or shell without whisper commands.
  }
}

export function initDownloadService(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (downloadStore.getState().serviceReady) return;

    await refreshInstalledWhisperModels();

    if (!progressUnlisten) {
      progressUnlisten = await onSetupDownloadProgress(applyProgress);
    }

    downloadStore.patch({ serviceReady: true });
  })();

  return initPromise;
}

export function disposeDownloadService(): void {
  progressUnlisten?.();
  progressUnlisten = null;
  initPromise = null;
  downloadStore.patch({ serviceReady: false });
}

export async function startWhisperModelDownload(modelId: WhisperModelSize): Promise<void> {
  await initDownloadService();

  const id = whisperDownloadId(modelId);
  const existing = downloadStore.getState().items[id];
  if (existing && (existing.status === 'starting' || existing.status === 'downloading')) {
    return;
  }

  upsertDownloadItem({
    id,
    kind: 'whisper-model',
    label: whisperLabel(modelId),
    subtitle: 'Speech recognition model',
    modelId,
    progress: 0,
    downloadedBytes: 0,
    status: 'queued',
    startedAt: Date.now(),
  });

  try {
    const result = await downloadWhisperModel(modelId);
    patchDownloadItem(id, {
      status: 'complete',
      progress: 1,
      downloadedBytes: result.bytes,
      totalBytes: result.bytes,
      completedAt: Date.now(),
    });
    await refreshInstalledWhisperModels();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('download_cancelled')) {
      patchDownloadItem(id, { status: 'cancelled', completedAt: Date.now() });
      return;
    }
    patchDownloadItem(id, {
      status: 'failed',
      error: message,
      completedAt: Date.now(),
    });
    throw error;
  }
}

export function startWhisperModelDownloadInBackground(modelId: WhisperModelSize): void {
  void startWhisperModelDownload(modelId).catch(() => undefined);
}

export async function cancelWhisperDownload(modelId: WhisperModelSize): Promise<void> {
  await cancelWhisperModelDownload(modelId);
  const id = whisperDownloadId(modelId);
  patchDownloadItem(id, { status: 'cancelled', completedAt: Date.now() });
}

export async function deleteWhisperModelFile(modelId: WhisperModelSize): Promise<void> {
  await deleteWhisperModel(modelId);
  await refreshInstalledWhisperModels();
}
