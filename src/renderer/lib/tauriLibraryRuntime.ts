import {
  dispatchLibraryScanBegin,
  dispatchLibraryScanEnd,
  dispatchLibraryScanProgress
} from './prismLibraryScanBridge';
import { isTauriShell } from './prismAdapter';
import { onScanProgress } from './tauriCommands';

let registered = false;

/** Wire Tauri scan-progress to DOM events (consumed by App toast coordinator). */
export function registerTauriLibraryScanBridge(): void {
  if (!isTauriShell() || registered) return;
  registered = true;

  void onScanProgress((payload) => {
    dispatchLibraryScanProgress(payload);
  });
}

export async function runTauriLibraryScan<T>(
  operation: () => Promise<T>
): Promise<T> {
  dispatchLibraryScanBegin();
  try {
    const result = await operation();
    dispatchLibraryScanEnd({ ok: true });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dispatchLibraryScanEnd({ ok: false, error: message });
    throw error;
  }
}
