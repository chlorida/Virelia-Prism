import type { AppSettings, MediaItem } from '../../../shared/types';
import { detectMediaIntent } from './mediaIntent';

export type VideoOpenPreference = 'smart' | 'always-watch' | 'music-audio-first';

export interface SmartOpenDecision {
  enterWatch: boolean;
  autoPlay: boolean;
  intent: ReturnType<typeof detectMediaIntent>;
}

export function resolveVideoOpenPreference(settings?: AppSettings): VideoOpenPreference {
  const pref = (settings as AppSettings & { playback?: { videoOpenBehavior?: VideoOpenPreference } })
    ?.playback?.videoOpenBehavior;
  if (pref === 'always-watch' || pref === 'music-audio-first') return pref;
  return 'smart';
}

export function resolveSmartOpen(
  item: MediaItem,
  settings: AppSettings | undefined,
  options?: {
    forceWatch?: boolean;
    alreadyPlayingId?: string;
    playerMode?: string;
  }
): SmartOpenDecision {
  const intent = detectMediaIntent(item);
  const pref = resolveVideoOpenPreference(settings);

  if (item.kind !== 'video') {
    return { enterWatch: false, autoPlay: true, intent };
  }

  if (options?.forceWatch) {
    return { enterWatch: true, autoPlay: true, intent };
  }

  if (options?.alreadyPlayingId === item.id) {
    if (options.playerMode === 'player') {
      return { enterWatch: false, autoPlay: false, intent };
    }
    if (options.playerMode === 'library') {
      return { enterWatch: true, autoPlay: false, intent };
    }
  }

  if (pref === 'always-watch') {
    return { enterWatch: true, autoPlay: true, intent };
  }

  if (pref === 'music-audio-first' && intent.mediaIntent === 'music-video') {
    return { enterWatch: false, autoPlay: true, intent };
  }

  if (pref === 'smart') {
    if (intent.mediaIntent === 'music-video' && intent.confidence >= 0.75) {
      return { enterWatch: false, autoPlay: true, intent };
    }
    if (
      intent.mediaIntent === 'series-episode'
      || intent.mediaIntent === 'anime-episode'
      || intent.mediaIntent === 'movie'
      || intent.mediaIntent === 'unknown-video'
      || intent.mediaIntent === 'short-video'
    ) {
      return { enterWatch: true, autoPlay: true, intent };
    }
  }

  return { enterWatch: true, autoPlay: true, intent };
}
