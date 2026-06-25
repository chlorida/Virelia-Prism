export type UiSoundId =
  | 'play'
  | 'pause'
  | 'seek'
  | 'open'
  | 'back'
  | 'tab'
  | 'confirm'
  | 'success'
  | 'warning'
  | 'error'
  | 'queue_add'
  | 'queue_remove'
  | 'mode_switch';

export type UiSoundCategory = 'playback' | 'navigation' | 'queue' | 'notifications' | 'warnings';

export type UiSoundPlaybackPolicy = 'always' | 'important_only' | 'disabled';

export interface UiSoundsSettings {
  enabled: boolean;
  /** 0–1 master gain for UI sounds. Default 0.12 */
  volume: number;
  duringPlayback: UiSoundPlaybackPolicy;
  categories: Record<UiSoundCategory, boolean>;
}

export const UI_SOUND_IDS: readonly UiSoundId[] = [
  'play',
  'pause',
  'seek',
  'open',
  'back',
  'tab',
  'confirm',
  'success',
  'warning',
  'error',
  'queue_add',
  'queue_remove',
  'mode_switch',
] as const;

export const UI_SOUND_CATEGORY_BY_ID: Record<UiSoundId, UiSoundCategory> = {
  play: 'playback',
  pause: 'playback',
  seek: 'playback',
  open: 'navigation',
  back: 'navigation',
  tab: 'navigation',
  mode_switch: 'navigation',
  queue_add: 'queue',
  queue_remove: 'queue',
  confirm: 'queue',
  success: 'notifications',
  warning: 'warnings',
  error: 'warnings',
};

export const UI_IMPORTANT_DURING_PLAYBACK = new Set<UiSoundId>([
  'warning',
  'error',
  'play',
  'pause',
]);

export const defaultUiSoundsSettings = (): UiSoundsSettings => ({
  enabled: false,
  volume: 0.12,
  duringPlayback: 'important_only',
  categories: {
    playback: true,
    navigation: true,
    queue: true,
    notifications: true,
    warnings: true,
  },
});
