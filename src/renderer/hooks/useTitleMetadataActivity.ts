import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import {
  getTitleMetadataActivity,
  subscribeTitleMetadata,
} from '../lib/mediaIntelligence/metadata/titleMetadataService';

export function useTitleMetadataActivity(title: LibraryTitle | undefined): 'idle' | 'search' | 'images' {
  return useSyncExternalStore(
    subscribeTitleMetadata,
    () => (title ? getTitleMetadataActivity(title) : 'idle'),
    () => 'idle'
  );
}

/** Elapsed seconds while metadata refresh/load is active. */
export function useMetadataBusyElapsed(busy: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  return elapsed;
}
