import { startTransition, useEffect, useRef } from 'react';
import { enrichMediaItemsInBackground } from '../lib/mediaMetadata';
import { patchDurationById, rebuildLibraryDurationSorted } from '../features/library/libraryStore';
import type { MediaFilter, SortMode } from '../../shared/types';
import type { FilteredMediaResult } from '../lib/search';

export function useDurationEnrichment(options: {
  filteredMedia: FilteredMediaResult;
  deferredQuery: string;
  filter: MediaFilter;
  sort: SortMode;
  mediaLength: number;
  sessionPlaying: boolean;
  durationById: Record<string, number>;
}) {
  const durationByIdRef = useRef(options.durationById);
  durationByIdRef.current = options.durationById;
  const enrichAbortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      rebuildLibraryDurationSorted();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [options.durationById]);

  useEffect(() => {
    if (options.sessionPlaying) return;
    enrichAbortRef.current?.abort();
    const controller = new AbortController();
    enrichAbortRef.current = controller;
    void enrichMediaItemsInBackground(
      options.filteredMedia.items.slice(0, 40),
      (updates) => {
        startTransition(() => {
          patchDurationById(updates);
        });
      },
      controller.signal,
      { knownDurations: durationByIdRef.current, maxItems: 40, concurrency: 1 }
    );
    return () => controller.abort();
  }, [
    options.filteredMedia.items.length,
    options.deferredQuery,
    options.filter,
    options.sort,
    options.mediaLength,
    options.sessionPlaying
  ]);
}
