export type PlaybackErrorType = 'corrupt' | 'incomplete' | 'unsupported' | 'missing';

export interface MediaPlaybackHealth {
  type: PlaybackErrorType;
  message: string;
  at: string;
  blocked: boolean;
}

const healthByMediaId = new Map<string, MediaPlaybackHealth>();

export function markMediaPlaybackFailed(
  mediaId: string,
  type: PlaybackErrorType,
  message: string
): void {
  healthByMediaId.set(mediaId, {
    type,
    message,
    at: new Date().toISOString(),
    blocked: true,
  });
}

export function clearMediaPlaybackHealth(mediaId: string): void {
  healthByMediaId.delete(mediaId);
}

export function getMediaPlaybackHealth(mediaId: string): MediaPlaybackHealth | undefined {
  return healthByMediaId.get(mediaId);
}

export function isMediaPlaybackBlocked(mediaId: string): boolean {
  return healthByMediaId.get(mediaId)?.blocked === true;
}

export function classifyPlaybackErrorMessage(message: string): PlaybackErrorType {
  const lower = message.toLowerCase();
  if (lower.includes('corrupt') || lower.includes('incomplete')) return 'corrupt';
  if (lower.includes('missing') || lower.includes('not found')) return 'missing';
  if (lower.includes('unsupported')) return 'unsupported';
  return 'corrupt';
}
