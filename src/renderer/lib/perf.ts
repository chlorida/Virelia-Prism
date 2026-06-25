/** Performance marks — enabled in dev or when VITE_VIRELIA_PERF=1 at build time. */



export type PerfBuildMode = 'dev' | 'release';



export function getPerfBuildMode(): PerfBuildMode {

  return typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 'dev' : 'release';

}



export function isPerfEnabled(): boolean {

  if (typeof performance === 'undefined') return false;

  if (typeof import.meta !== 'undefined') {

    if (import.meta.env?.DEV) return true;

    if (import.meta.env?.VITE_VIRELIA_PERF === '1') return true;

  }

  return false;

}



const processStartMs =

  typeof performance !== 'undefined' && performance.timeOrigin

    ? performance.timeOrigin

    : Date.now();



export function perfOriginMs(): number {

  return processStartMs;

}



export function perfElapsedMs(mark?: string): number {

  if (typeof performance === 'undefined') return 0;

  if (mark) {

    const entry = performance.getEntriesByName(mark).pop();

    if (entry && 'startTime' in entry) return entry.startTime;

  }

  return performance.now();

}



export function perfLog(line: string): void {
  if (!isPerfEnabled()) return;
  const formatted = `[Virelia Perf] ${line}`;
  console.info(formatted);
  void persistPerfLine(formatted);
}

async function persistPerfLine(line: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('append_perf_log', { line });
  } catch {
    // Electron shell or invoke unavailable
  }
}



export function perfMark(name: string): void {

  if (!isPerfEnabled()) return;

  try {

    performance.mark(name);

  } catch {

    // ignore

  }

}



export function perfMeasure(name: string, startMark: string, endMark?: string): number | undefined {

  if (!isPerfEnabled()) return undefined;

  try {

    const end = endMark ?? `${startMark}-end`;

    if (!endMark) performance.mark(end);

    performance.measure(name, startMark, end);

    const entry = performance.getEntriesByName(name).pop();

    const ms = entry?.duration;

    perfLog(`${name}=${ms != null ? ms.toFixed(1) : '?'}ms`);

    return ms;

  } catch {

    return undefined;

  }

}



export async function perfAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {

  const start = `${name}-start`;

  perfMark(start);

  try {

    return await fn();

  } finally {

    perfMeasure(name, start);

  }

}



export function perfSync<T>(name: string, fn: () => T): T {

  const start = `${name}-start`;

  perfMark(start);

  try {

    return fn();

  } finally {

    perfMeasure(name, start);

  }

}



export function perfMarkFirstShellRender(): void {

  perfMark('renderer-first-shell-render');

  perfMeasure('renderer-bootstrap-to-shell', 'app-bootstrap-start', 'renderer-first-shell-render');

}



export function perfMarkWatchModeEnter(): void {

  perfMark('watch-mode-enter');

}



export function perfMarkWatchModeExit(): void {

  perfMark('watch-mode-exit');

}



export function perfMarkVideoSwitch(mediaId: string): void {

  perfMark(`video-switch-${mediaId}`);

}



export function perfMeasureVideoSwitch(mediaId: string): void {

  perfMeasure('video-switch', `video-switch-${mediaId}`);

}


