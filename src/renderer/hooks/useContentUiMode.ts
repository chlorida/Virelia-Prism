import { useMemo } from 'react';
import type { PlaybackStatus } from '../playback/playbackTypes';

export type ContentUiMode = 'library' | 'audio' | 'video-preview' | 'video-theater';

export interface ContentUiModeInput {
  isVideo: boolean;
  isPreviewVisible: boolean;
  isPreviewCollapsed: boolean;
  hasTrack: boolean;
  playbackStatus: PlaybackStatus;
  videoTheater: boolean;
}

export function resolveContentUiMode(input: ContentUiModeInput): ContentUiMode {
  if (input.videoTheater && input.isVideo) return 'video-theater';
  if (input.isVideo && input.isPreviewVisible && !input.isPreviewCollapsed) return 'video-preview';
  if (input.hasTrack && !input.isVideo) return 'audio';
  return 'library';
}

export function useContentUiMode(input: ContentUiModeInput): ContentUiMode {
  return useMemo(() => resolveContentUiMode(input), [
    input.isVideo,
    input.isPreviewVisible,
    input.isPreviewCollapsed,
    input.hasTrack,
    input.playbackStatus,
    input.videoTheater
  ]);
}
