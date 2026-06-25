import { describe, expect, it, vi } from 'vitest';
import { demoMedia } from '../../../shared/defaults';
import type { MediaItem } from '../../../shared/types';
import { applyScanMedia, commitLibraryItems } from './libraryActions';

describe('libraryActions', () => {
  it('does not merge demo rows without file paths when demo flag is off', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_SHOW_DEMO_LIBRARY', 'false');
    const merged = applyScanMedia([], demoMedia);
    expect(merged).toEqual([]);
  });

  it('commitLibraryItems splits audio and video', () => {
    const items = [
      { id: '1', title: 'A', kind: 'audio', filePath: 'C:\\a.mp3', folder: 'x', addedAt: '', tags: [] },
      { id: '2', title: 'B', kind: 'video', filePath: 'C:\\b.mp4', folder: 'x', addedAt: '', tags: [] }
    ] as unknown as MediaItem[];
    const result = commitLibraryItems(items, {});
    expect(result.audio).toHaveLength(1);
    expect(result.video).toHaveLength(1);
  });
});
