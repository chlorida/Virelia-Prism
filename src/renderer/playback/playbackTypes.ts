import type { EngineStatus, MediaItem, RepeatMode } from '../../shared/types';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface UnifiedPlaybackState {
  currentTrack: MediaItem | null;
  selectedTrackId: string | null;
  playbackStatus: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  error: string | null;
  errorTechnical: string | null;
  isVideo: boolean;
  isPreviewVisible: boolean;
  isPreviewCollapsed: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  bufferedEnd: number;
  engineStatus: EngineStatus;
}

export const initialEngineStatus: EngineStatus = {
  engine: 'html5-fallback',
  available: true,
  message: 'HTML5 media engine'
};

export function createInitialPlaybackState(
  volume = 0.74,
  speed = 1,
  repeat: RepeatMode = 'off',
  shuffle = false
): UnifiedPlaybackState {
  return {
    currentTrack: null,
    selectedTrackId: null,
    playbackStatus: 'idle',
    currentTime: 0,
    duration: 0,
    volume,
    muted: false,
    playbackRate: speed,
    error: null,
    errorTechnical: null,
    isVideo: false,
    isPreviewVisible: false,
    isPreviewCollapsed: false,
    repeat,
    shuffle,
    bufferedEnd: 0,
    engineStatus: initialEngineStatus
  };
}

export function isActivelyPlaying(status: PlaybackStatus): boolean {
  return status === 'playing';
}
