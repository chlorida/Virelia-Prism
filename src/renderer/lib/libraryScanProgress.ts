import type { ScanProgressPayload } from './tauriCommands';
import { libraryPerfRecordIpc } from './libraryPerf';

const THROTTLE_MS = 300;
let lastProgressAt: number | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let latest: Pick<ScanProgressPayload, 'scanned' | 'added' | 'done'> | null = null;

/** Stall detection — updated on every IPC payload without touching library store. */
export function getLastLibraryScanProgressAt(): number | null {
  return lastProgressAt;
}

export function noteLibraryScanProgressPayload(payload: ScanProgressPayload): void {
  libraryPerfRecordIpc();
  lastProgressAt = Date.now();
  latest = { scanned: payload.scanned, added: payload.added, done: payload.done };

  if (payload.done) {
    flushLibraryScanProgressThrottle();
    return;
  }

  if (throttleTimer) return;
  throttleTimer = globalThis.setTimeout(flushLibraryScanProgressThrottle, THROTTLE_MS);
}

export function flushLibraryScanProgressThrottle(): void {
  if (throttleTimer) {
    globalThis.clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  latest = null;
}

export function resetLibraryScanProgressClock(): void {
  lastProgressAt = null;
  flushLibraryScanProgressThrottle();
}

export function peekLibraryScanProgress(): Pick<ScanProgressPayload, 'scanned' | 'added'> | null {
  if (!latest) return null;
  return { scanned: latest.scanned, added: latest.added };
}
