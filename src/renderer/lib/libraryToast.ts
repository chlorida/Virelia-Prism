import type { ToastOptions } from '../components/ToastStack';

const LIBRARY_TOAST_KEY = 'library-sync';
const FINISH_DEBOUNCE_MS = 3000;

export type ShowToastFn = (text: string, options?: number | ToastOptions) => void;

/** One toast lifecycle per library scan/update burst. */
export class LibraryToastCoordinator {
  private active = false;
  private finishTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  begin(showToast: ShowToastFn, scanningLabel: string): void {
    this.active = true;
    if (this.finishTimer !== undefined) {
      globalThis.clearTimeout(this.finishTimer);
      this.finishTimer = undefined;
    }
    showToast(scanningLabel, { key: LIBRARY_TOAST_KEY, durationMs: 12_000 });
  }

  finish(showToast: ShowToastFn, updatedLabel: string): void {
    if (!this.active) return;
    if (this.finishTimer !== undefined) globalThis.clearTimeout(this.finishTimer);
    this.finishTimer = globalThis.setTimeout(() => {
      this.finishTimer = undefined;
      this.active = false;
      showToast(updatedLabel, { key: LIBRARY_TOAST_KEY });
    }, FINISH_DEBOUNCE_MS);
  }

  fail(showToast: ShowToastFn, message: string): void {
    this.active = false;
    if (this.finishTimer !== undefined) {
      globalThis.clearTimeout(this.finishTimer);
      this.finishTimer = undefined;
    }
    showToast(message, { key: LIBRARY_TOAST_KEY });
  }

  reset(): void {
    this.active = false;
    if (this.finishTimer !== undefined) {
      globalThis.clearTimeout(this.finishTimer);
      this.finishTimer = undefined;
    }
  }
}
