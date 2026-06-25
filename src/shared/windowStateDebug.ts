export function isWindowStateDebugEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

export function logWindowState(event: string, details: Record<string, unknown>): void {
  if (!isWindowStateDebugEnabled()) return;
  console.info(`[window-state] ${event}`, details);
}

export function logIgnoredBoundsSave(reason: string, details?: Record<string, unknown>): void {
  if (!isWindowStateDebugEnabled()) return;
  console.info('[window-state] ignoredBoundsSave', { reason, ...details });
}
