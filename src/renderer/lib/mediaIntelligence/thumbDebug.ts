const enabled =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV
    ? true
    : typeof process !== 'undefined' && process.env?.VIRELIA_THUMB_DEBUG === '1';

export function isThumbDebugEnabled(): boolean {
  return enabled;
}

export function thumbLog(message: string, detail?: Record<string, unknown>): void {
  if (!enabled) return;
  if (detail) console.debug(`[Thumb] ${message}`, detail);
  else console.debug(`[Thumb] ${message}`);
}
