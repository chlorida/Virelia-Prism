import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { LibraryToastCoordinator } from './libraryToast';

describe('LibraryToastCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces finish toast into one update', () => {
    const showToast = vi.fn();
    const coordinator = new LibraryToastCoordinator();

    coordinator.begin(showToast, 'Scanning...');
    coordinator.finish(showToast, 'Library updated');
    coordinator.finish(showToast, 'Library updated');
    coordinator.finish(showToast, 'Library updated');

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0]?.[1]).toEqual({ key: 'library-sync', durationMs: 12_000 });

    vi.advanceTimersByTime(3000);
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast.mock.calls[1]?.[0]).toBe('Library updated');
  });
});
