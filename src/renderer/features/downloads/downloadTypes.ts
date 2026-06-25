import type { WhisperModelSize } from '../../../shared/subtitleTypes';

/** Extensible download kinds — media rows can be added later without reshaping the store. */
export type DownloadKind = 'whisper-model' | 'media';

export type DownloadStatus =
  | 'queued'
  | 'starting'
  | 'downloading'
  | 'complete'
  | 'cancelled'
  | 'failed';

export interface DownloadItem {
  id: string;
  kind: DownloadKind;
  label: string;
  subtitle?: string;
  modelId?: WhisperModelSize;
  /** Future: catalog title id, torrent id, etc. */
  mediaRef?: string;
  progress: number;
  downloadedBytes: number;
  totalBytes?: number;
  status: DownloadStatus;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export const WHISPER_MODEL_META: Record<
  Extract<WhisperModelSize, 'base' | 'small' | 'medium' | 'large-v3'>,
  { label: string; sizeMb: number; detail: string }
> = {
  base: {
    label: 'Whisper Base',
    sizeMb: 150,
    detail: 'Fastest speech model — good for quick subtitles.',
  },
  small: {
    label: 'Whisper Small',
    sizeMb: 466,
    detail: 'Balanced quality and speed for everyday use.',
  },
  medium: {
    label: 'Whisper Medium',
    sizeMb: 1530,
    detail: 'Higher accuracy for dialogue-heavy content.',
  },
  'large-v3': {
    label: 'Whisper Large v3',
    sizeMb: 3090,
    detail: 'Best quality when your PC can handle it.',
  },
};

export function whisperDownloadId(modelId: WhisperModelSize): string {
  return `whisper:${modelId}`;
}

export function isActiveDownloadStatus(status: DownloadStatus): boolean {
  return status === 'queued' || status === 'starting' || status === 'downloading';
}
