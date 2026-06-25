import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { indexMediaLibraryQuick } from './mediaIndex';
import { sortMediaByTitle } from './search';

function syntheticLibrary(count: number): MediaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    filePath: `D:/Media/Show/Episode ${String(i % 500).padStart(3, '0')}.mkv`,
    fileName: `Episode ${i}.mkv`,
    folder: 'D:/Media/Show',
    title: `Episode ${i}.mkv`,
    tags: [],
    kind: 'video' as const,
    addedAt: '',
    favorite: false,
  }));
}

describe('startup benchmark (synthetic 27k)', () => {
  const COUNT = 27_000;
  const items = syntheticLibrary(COUNT);

  it('measures quick index vs full sort', () => {
    const t0 = performance.now();
    const quick = indexMediaLibraryQuick(items);
    const quickMs = performance.now() - t0;

    const t1 = performance.now();
    const sorted = sortMediaByTitle(quick);
    const sortMs = performance.now() - t1;

    console.info(`[Virelia Perf Bench] quick index ${COUNT} items: ${quickMs.toFixed(1)} ms`);
    console.info(`[Virelia Perf Bench] sort ${COUNT} items: ${sortMs.toFixed(1)} ms`);
    console.info(`[Virelia Perf Bench] combined (warm path target): ${(quickMs + sortMs).toFixed(1)} ms`);

    expect(quick.length).toBe(COUNT);
    expect(sorted.length).toBe(COUNT);
    expect(quickMs).toBeLessThan(5000);
  });
});
