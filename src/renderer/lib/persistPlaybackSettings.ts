import type { AppSettings } from '../../shared/types';

type PlaybackPatch = Partial<AppSettings['playback']>;

let volumeTimer: number | undefined;
let speedTimer: number | undefined;
let pendingVolume: number | undefined;
let pendingSpeed: number | undefined;

function flush(save: (patch: PlaybackPatch) => void, patch: PlaybackPatch): void {
  try {
    save(patch);
  } catch {
    // ignore
  }
}

export function schedulePersistVolume(
  volume: number,
  save: (patch: PlaybackPatch) => void
): void {
  pendingVolume = volume;
  if (volumeTimer !== undefined) window.clearTimeout(volumeTimer);
  volumeTimer = window.setTimeout(() => {
    volumeTimer = undefined;
    if (pendingVolume === undefined) return;
    const value = pendingVolume;
    pendingVolume = undefined;
    flush(save, { volume: value });
  }, 450);
}

export function schedulePersistSpeed(
  speed: number,
  save: (patch: PlaybackPatch) => void
): void {
  pendingSpeed = speed;
  if (speedTimer !== undefined) window.clearTimeout(speedTimer);
  speedTimer = window.setTimeout(() => {
    speedTimer = undefined;
    if (pendingSpeed === undefined) return;
    const value = pendingSpeed;
    pendingSpeed = undefined;
    flush(save, { speed: value });
  }, 300);
}

export function flushPersistedPlaybackSettings(save: (patch: PlaybackPatch) => void): void {
  if (volumeTimer !== undefined) {
    window.clearTimeout(volumeTimer);
    volumeTimer = undefined;
  }
  if (speedTimer !== undefined) {
    window.clearTimeout(speedTimer);
    speedTimer = undefined;
  }
  const patch: PlaybackPatch = {};
  if (pendingVolume !== undefined) {
    patch.volume = pendingVolume;
    pendingVolume = undefined;
  }
  if (pendingSpeed !== undefined) {
    patch.speed = pendingSpeed;
    pendingSpeed = undefined;
  }
  if (Object.keys(patch).length > 0) flush(save, patch);
}
