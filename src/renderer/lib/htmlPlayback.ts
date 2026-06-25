import { getPrism } from './prismApi';

let loadGeneration = 0;
const resolvedMediaUrlCache = new Map<string, string>();

export function peekResolvedMediaUrl(filePath: string): string | undefined {
  return resolvedMediaUrlCache.get(filePath);
}

export async function resolveMediaUrl(filePath: string): Promise<string> {
  const cached = resolvedMediaUrlCache.get(filePath);
  if (cached) return cached;
  const prism = getPrism();
  if (!prism) return '';
  const url = await prism.mediaUrl(filePath);
  if (url) resolvedMediaUrlCache.set(filePath, url);
  return url;
}

export function cancelHtmlPlaybackLoads(): void {  loadGeneration += 1;
}

/** Apply persisted volume/speed; muted is independent of volume level. */
export function configureMediaElement(
  element: HTMLMediaElement,
  volume: number,
  speed: number,
  muted = false
): void {
  element.volume = Math.max(0, Math.min(1, volume));
  element.playbackRate = speed;
  element.muted = muted;
  element.defaultMuted = muted;
  if (muted) element.setAttribute('muted', '');
  else element.removeAttribute('muted');
}

export async function loadMediaPaused(
  element: HTMLMediaElement,
  filePath: string,
  volume: number,
  speed: number,
  startSeconds: number,
  muted = false
): Promise<void> {
  const generation = ++loadGeneration;
  const isStale = () => generation !== loadGeneration;

  const url = await resolveMediaUrl(filePath);
  if (isStale()) return;

  configureMediaElement(element, volume, speed, muted);

  if (element.src !== url) {
    element.pause();
    element.src = url;
    element.load();
    await waitForMediaReady(element, isStale);
  }

  if (isStale()) return;

  await waitForSeekMetadata(element, isStale);
  if (isStale()) return;

  const duration = Number.isFinite(element.duration) ? element.duration : 0;
  const start = duration > 0 ? Math.min(Math.max(0, startSeconds), duration) : Math.max(0, startSeconds);
  try {
    element.currentTime = start;
  } catch {
    // seek may fail before metadata; ignore
  }
  element.pause();
}

function waitForSeekMetadata(
  element: HTMLMediaElement,
  isStale: () => boolean
): Promise<void> {
  if (isStale()) return Promise.reject(new Error('Media load superseded'));
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Metadata timeout'));
    }, 12_000);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener('loadedmetadata', onReady);
      element.removeEventListener('durationchange', onReady);
    };
    element.addEventListener('loadedmetadata', onReady, { once: true });
    element.addEventListener('durationchange', onReady, { once: true });
  });
}

export async function loadAndPlayMedia(
  element: HTMLMediaElement,
  filePath: string,
  volume: number,
  speed: number,
  muted = false
): Promise<void> {
  const generation = ++loadGeneration;
  const isStale = () => generation !== loadGeneration;

  const url = await resolveMediaUrl(filePath);
  if (isStale()) return;

  configureMediaElement(element, volume, speed, muted);

  if (element.src !== url) {
    element.pause();
    element.src = url;
    element.load();
    await waitForMediaReady(element, isStale);
  }

  if (isStale()) return;
  await element.play();
}

function waitForMediaReady(
  element: HTMLMediaElement,
  isStale: () => boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isStale()) {
      reject(new Error('Media load superseded'));
      return;
    }

    if (element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Media load timed out'));
    }, 30_000);

    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Media load failed'));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener('canplay', onReady);
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('error', onError);
    };

    element.addEventListener('canplay', onReady);
    element.addEventListener('loadeddata', onReady);
    element.addEventListener('error', onError);
  });
}
