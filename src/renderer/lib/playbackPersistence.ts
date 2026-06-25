export const PLAYBACK_SESSION_KEY = 'virelia.playbackSession';
export const MINI_PLAYER_MODE_KEY = 'virelia.miniPlayerMode';

export interface PlaybackSession {
  currentTrackId: string;
  currentPath: string;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  updatedAt: string;
}

/** @deprecated use currentTrackId */
export type LegacyPlaybackSession = {
  mediaId: string;
  positionSeconds: number;
  updatedAt?: string;
};

function isLegacySession(value: Partial<PlaybackSession & LegacyPlaybackSession>): value is LegacyPlaybackSession {
  return typeof value.mediaId === 'string' && value.currentTrackId === undefined;
}

export function loadPlaybackSession(): PlaybackSession | null {
  try {
    const raw = localStorage.getItem(PLAYBACK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlaybackSession & LegacyPlaybackSession>;

    if (isLegacySession(parsed)) {
      const positionSeconds = Number(parsed.positionSeconds);
      if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return null;
      return {
        currentTrackId: parsed.mediaId,
        currentPath: '',
        currentTime: positionSeconds,
        duration: 0,
        volume: 1,
        muted: false,
        playbackRate: 1,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
      };
    }

    if (typeof parsed.currentTrackId !== 'string' || !parsed.currentTrackId) return null;
    const currentTime = Number(parsed.currentTime);
    if (!Number.isFinite(currentTime) || currentTime < 0) return null;

    return {
      currentTrackId: parsed.currentTrackId,
      currentPath: typeof parsed.currentPath === 'string' ? parsed.currentPath : '',
      currentTime,
      duration: Number.isFinite(Number(parsed.duration)) ? Math.max(0, Number(parsed.duration)) : 0,
      volume: Number.isFinite(Number(parsed.volume)) ? Math.max(0, Math.min(1, Number(parsed.volume))) : 1,
      muted: Boolean(parsed.muted),
      playbackRate: Number.isFinite(Number(parsed.playbackRate)) && Number(parsed.playbackRate) > 0
        ? Number(parsed.playbackRate)
        : 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export interface SavePlaybackSessionInput {
  mediaId: string;
  filePath?: string;
  positionSeconds: number;
  durationSeconds?: number;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
}

export function savePlaybackSession(session: SavePlaybackSessionInput): void {
  try {
    const payload: PlaybackSession = {
      currentTrackId: session.mediaId,
      currentPath: session.filePath ?? '',
      currentTime: Math.max(0, session.positionSeconds),
      duration: Math.max(0, session.durationSeconds ?? 0),
      volume: session.volume !== undefined
        ? Math.max(0, Math.min(1, session.volume))
        : 1,
      muted: Boolean(session.muted),
      playbackRate: session.playbackRate !== undefined && session.playbackRate > 0
        ? session.playbackRate
        : 1,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(PLAYBACK_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function clearPlaybackSession(): void {
  try {
    localStorage.removeItem(PLAYBACK_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** If within 5s of end, restart from beginning on restore. */
export function resolveRestorePosition(positionSeconds: number, durationSeconds?: number): number {
  const position = Math.max(0, positionSeconds);
  if (durationSeconds !== undefined && durationSeconds > 0 && durationSeconds - position < 5) {
    return 0;
  }
  return position;
}

export function loadMiniPlayerMode(): boolean {
  try {
    return localStorage.getItem(MINI_PLAYER_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMiniPlayerMode(active: boolean): void {
  try {
    localStorage.setItem(MINI_PLAYER_MODE_KEY, active ? 'true' : 'false');
  } catch {
    // ignore
  }
}
