import type { MediaItem } from '../../shared/types';

export interface MediaErrorInfo {
  userMessageKey: MediaErrorKey;
  userMessage: string;
  technical: string;
}

export type MediaErrorKey =
  | 'error.media.missing'
  | 'error.media.unsupported'
  | 'error.media.permission'
  | 'error.media.corrupt'
  | 'error.media.aborted'
  | 'error.media.unknown';

const MEDIA_ERROR_CODES: Record<number, MediaErrorKey> = {
  1: 'error.media.aborted',
  2: 'error.media.permission',
  3: 'error.media.unsupported',
  4: 'error.media.corrupt'
};

function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 ? filePath.slice(dot + 1).toLowerCase() : '';
}

/** MKV and exotic containers often fail in Chromium without a supported codec. */
export function isLikelyUnsupportedContainer(filePath: string): boolean {
  const ext = extensionOf(filePath);
  return ext === 'mkv' || ext === 'avi' || ext === 'wmv' || ext === 'flv';
}

export function describeMediaError(
  element: HTMLMediaElement | null,
  track: MediaItem | null | undefined,
  translate: (key: MediaErrorKey) => string
): MediaErrorInfo {
  const filePath = track?.filePath ?? '';
  const ext = extensionOf(filePath);
  const code = element?.error?.code;
  const mediaMessage = element?.error?.message ?? 'none';

  let userMessageKey: MediaErrorKey = 'error.media.unknown';

  if (!filePath) {
    userMessageKey = 'error.media.missing';
  } else if (code && MEDIA_ERROR_CODES[code]) {
    userMessageKey = MEDIA_ERROR_CODES[code];
  } else if (isLikelyUnsupportedContainer(filePath)) {
    userMessageKey = 'error.media.unsupported';
  }

  const technical = [
    `trackId=${track?.id ?? 'none'}`,
    `path=${filePath || 'none'}`,
    `ext=${ext || 'none'}`,
    `kind=${track?.kind ?? 'none'}`,
    `mediaErrorCode=${code ?? 'none'}`,
    `mediaErrorMessage=${mediaMessage}`,
    `src=${element?.currentSrc || element?.src || 'empty'}`,
    `readyState=${element?.readyState ?? 'none'}`
  ].join(' | ');

  console.error('[Virelia playback]', technical);

  return {
    userMessageKey,
    userMessage: translate(userMessageKey),
    technical
  };
}

// Re-export path helper if needed without node path in renderer - use simple ext only
export { extensionOf };
