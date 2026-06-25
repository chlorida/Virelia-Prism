import type { MediaItem } from '../../shared/types';
import type { PlaybackStatus } from '../playback/playbackTypes';
import { isActivelyPlaying } from '../playback/playbackTypes';

export type VideoRowActionKind = 'play' | 'resume' | 'watching' | 'focus' | 'pause';

export interface VideoRowActionState {
  kind: VideoRowActionKind;
  labelKey: 'player.play' | 'player.resume' | 'player.watching' | 'player.focusPlayer' | 'player.pause';
  disabled: boolean;
  forceWatch: boolean;
}

export function resolveVideoRowPlayAction(
  item: MediaItem,
  options: {
    isCurrent: boolean;
    isPlaying: boolean;
    playbackStatus?: PlaybackStatus;
    inWatchMode?: boolean;
  }
): VideoRowActionState {
  const resume = (item.resumePositionSeconds ?? 0) > 30
    && item.durationSeconds
    && (item.resumePositionSeconds ?? 0) / item.durationSeconds < 0.92;

  if (options.isCurrent) {
    const playing = options.isPlaying || isActivelyPlaying(options.playbackStatus ?? 'idle');
    if (playing) {
      return {
        kind: 'watching',
        labelKey: options.inWatchMode ? 'player.watching' : 'player.focusPlayer',
        disabled: false,
        forceWatch: false,
      };
    }
    if (options.playbackStatus === 'paused') {
      return {
        kind: 'pause',
        labelKey: 'player.play',
        disabled: false,
        forceWatch: true,
      };
    }
    return {
      kind: 'focus',
      labelKey: 'player.focusPlayer',
      disabled: false,
      forceWatch: true,
    };
  }

  return {
    kind: resume ? 'resume' : 'play',
    labelKey: resume ? 'player.resume' : 'player.play',
    disabled: false,
    forceWatch: true,
  };
}

export function resolveBottomVideoOpenLabel(options: {
  isCurrent: boolean;
  inWatchMode: boolean;
  resumeSeconds?: number;
}): 'player.focusPlayer' | 'player.openPlayer' | 'player.resume' {
  if (options.inWatchMode && options.isCurrent) return 'player.focusPlayer';
  const resume = (options.resumeSeconds ?? 0) > 30;
  if (resume) return 'player.resume';
  return 'player.openPlayer';
}
