import type { PrismApi } from '../../shared/prismApi.types';
import { ensurePrismBridge, isElectronShell, isPrismBridgeReady, isTauriShell } from './prismAdapter';

export type { PrismApi } from '../../shared/prismApi.types';

export function isPrismReady(): boolean {
  return isPrismBridgeReady();
}

export function getPrism(): PrismApi | null {
  if (typeof window === 'undefined') return null;
  if (isElectronShell() || isTauriShell()) {
    return window.prism ?? null;
  }
  return null;
}

export { ensurePrismBridge, isElectronShell, isTauriShell, getPrismShell } from './prismAdapter';
export type { PrismShell } from './prismAdapter';

/** No-op unsubscribe when preload API is unavailable. */
export function noopUnsubscribe(): void {
  // intentional
}

/** Call once before React root render (Tauri only). */
export async function bootstrapPrismApi(): Promise<PrismApi | null> {
  return ensurePrismBridge();
}
