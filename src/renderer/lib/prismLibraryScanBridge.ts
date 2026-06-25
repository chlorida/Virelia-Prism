import type { ScanProgressPayload } from './tauriCommands';

export const LIBRARY_SCAN_BEGIN = 'prism:library-scan-begin';
export const LIBRARY_SCAN_PROGRESS = 'prism:library-scan-progress';
export const LIBRARY_SCAN_END = 'prism:library-scan-end';

export interface LibraryScanEndDetail {
  ok: boolean;
  error?: string;
}

export function dispatchLibraryScanBegin(): void {
  window.dispatchEvent(new CustomEvent(LIBRARY_SCAN_BEGIN));
}

export function dispatchLibraryScanProgress(payload: ScanProgressPayload): void {
  window.dispatchEvent(new CustomEvent(LIBRARY_SCAN_PROGRESS, { detail: payload }));
}

export function dispatchLibraryScanEnd(detail: LibraryScanEndDetail): void {
  window.dispatchEvent(new CustomEvent(LIBRARY_SCAN_END, { detail }));
}
