import type { AppSettings, MediaItem } from '../../../shared/types';
import { enterPlayerMode } from '../../features/ui/playerModeStore';
import type { PlaybackActions } from '../../playback/usePlayback';
import { resolveSmartOpen } from './smartOpen';

export type SmartOpenSource =
  | 'row-play'
  | 'double-click'
  | 'keyboard-enter'
  | 'up-next'
  | 'bottom-next'
  | 'preview-play'
  | 'bottom-open';

export interface SmartOpenMediaOptions {
  source?: SmartOpenSource;
  forceWatch?: boolean;
  autoplay?: boolean;
  playerMode?: string;
  alreadyPlayingId?: string;
}

export interface SmartOpenMediaContext {
  item: MediaItem;
  settings?: AppSettings;
  playbackActions: Pick<PlaybackActions, 'loadTrack' | 'setPreviewCollapsed'>;
  options?: SmartOpenMediaOptions;
}

export interface SmartOpenMediaResult {
  enterWatch: boolean;
  autoPlay: boolean;
}

/** Single entry for opening media from UI, keyboard, and queue. */
export async function smartOpenMedia(ctx: SmartOpenMediaContext): Promise<SmartOpenMediaResult> {
  const { item, settings, playbackActions, options } = ctx;
  const decision = resolveSmartOpen(item, settings, {
    forceWatch: options?.forceWatch,
    alreadyPlayingId: options?.alreadyPlayingId,
    playerMode: options?.playerMode,
  });

  const autoPlay = options?.autoplay ?? decision.autoPlay;

  if (item.kind === 'video' && decision.enterWatch) {
    enterPlayerMode();
    playbackActions.setPreviewCollapsed(false);
  }

  if (options?.alreadyPlayingId === item.id && !autoPlay) {
    return { enterWatch: decision.enterWatch, autoPlay };
  }

  await playbackActions.loadTrack(item, { autoPlay });

  return { enterWatch: decision.enterWatch, autoPlay };
}

export function shouldEnterWatchForItem(
  item: MediaItem,
  settings?: AppSettings,
  options?: { forceWatch?: boolean }
): boolean {
  return resolveSmartOpen(item, settings, {
    forceWatch: options?.forceWatch,
  }).enterWatch;
}
