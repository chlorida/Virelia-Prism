import type { MediaItem } from '../../../shared/types';
import { getPrism } from '../prismApi';
import { thumbLog } from './thumbDebug';

function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      el.removeEventListener(event, onOk);
    };
    el.addEventListener(event, onOk, { once: true });
  });
}

export function seekSecondsForRatio(durationSeconds: number, seekRatio: number): number {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 60;
  const clampedRatio = Math.min(0.98, Math.max(0.02, seekRatio));
  const seekTo = duration * clampedRatio;
  return Math.max(0.5, Math.min(duration - 0.5, seekTo));
}

async function captureFrameAtTime(video: HTMLVideoElement, seekRatio: number): Promise<string | undefined> {
  const seekTo = seekSecondsForRatio(video.duration, seekRatio);
  video.currentTime = seekTo;
  await waitForEvent(video, 'seeked', 8000);

  const width = 320;
  const height = 180;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Renderer fallback when main-process ffmpeg is unavailable. */
export async function captureVideoFrameDataUrl(
  item: MediaItem,
  seekRatio = 0.12
): Promise<string | undefined> {
  const frames = await captureVideoFramesAtRatios(item, [seekRatio]);
  return frames[0];
}

/** Capture multiple frames from one file, reusing a single video element. */
export async function captureVideoFramesAtRatios(
  item: MediaItem,
  seekRatios: number[]
): Promise<(string | undefined)[]> {
  const prism = getPrism();
  if (!prism || item.kind !== 'video' || !item.filePath || seekRatios.length === 0) {
    return seekRatios.map(() => undefined);
  }

  thumbLog('canvas batch start', { mediaId: item.id, path: item.filePath, count: seekRatios.length });

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    const url = await prism.mediaUrl(item.filePath);
    video.src = url;
    await waitForEvent(video, 'loadedmetadata', 15000);

    const results: (string | undefined)[] = [];
    for (const ratio of seekRatios) {
      try {
        results.push(await captureFrameAtTime(video, ratio));
      } catch (error) {
        thumbLog('canvas batch frame failed', {
          mediaId: item.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        results.push(undefined);
      }
    }

    thumbLog('canvas batch success', { mediaId: item.id, ready: results.filter(Boolean).length });
    return results;
  } catch (error) {
    thumbLog('canvas batch failed', {
      mediaId: item.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return seekRatios.map(() => undefined);
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
