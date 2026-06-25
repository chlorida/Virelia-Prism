import { describe, expect, it, vi } from 'vitest';
import { demoMedia } from '../../shared/defaults';
import { filterLibraryForShell, isDemoLibraryEnabled, resolveBootstrapLibrary } from './initialLibrary';

describe('initialLibrary', () => {
  it('uses empty library when no folders and demo flag is off', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_SHOW_DEMO_LIBRARY', 'false');
    expect(resolveBootstrapLibrary([], [])).toEqual([]);
    expect(isDemoLibraryEnabled()).toBe(false);
  });

  it('uses demo media only when demo flag is on', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_SHOW_DEMO_LIBRARY', 'true');
    expect(resolveBootstrapLibrary([], [])).toEqual(demoMedia);
    expect(isDemoLibraryEnabled()).toBe(true);
  });

  it('returns scanned media when folders are configured', () => {
    const scanned = [{ id: 'a', filePath: 'C:\\music\\a.mp3' } as import('../../shared/types').MediaItem];
    expect(resolveBootstrapLibrary(['C:\\music'], scanned)).toBe(scanned);
  });

  it('filters demo rows without file paths', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_SHOW_DEMO_LIBRARY', 'false');
    const items = [
      { id: 'demo', filePath: '', title: 'Demo' },
      { id: 'real', filePath: 'C:\\a.mp3', title: 'Real' }
    ] as import('../../shared/types').MediaItem[];
    expect(filterLibraryForShell(items)).toEqual([items[1]]);
  });
});
