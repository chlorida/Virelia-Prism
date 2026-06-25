import { useEffect, useSyncExternalStore } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import type { TitleMetadataRecord } from '../../shared/titleMetadataTypes';
import {
  ensureTitleMetadataHydrated,
  getTitleMetadataRecord,
  requestTitleMetadata,
  subscribeTitleMetadata,
  type MetadataPriority,
} from '../lib/mediaIntelligence/metadata/titleMetadataService';

export function useTitleMetadata(
  title: LibraryTitle | undefined,
  priority: MetadataPriority = 'normal'
): TitleMetadataRecord | undefined {
  const snapshot = useSyncExternalStore(
    subscribeTitleMetadata,
    () => (title ? getTitleMetadataRecord(title) : undefined),
    () => undefined
  );

  useEffect(() => {
    if (!title) return;
    let cancelled = false;
    void ensureTitleMetadataHydrated(title).then((record) => {
      if (cancelled) return;
      if (
        record.metadata
        && (record.state === 'metadataReady' || record.state === 'metadataNeedsReview')
      ) {
        return;
      }
      requestTitleMetadata(title, priority);
    });
    return () => {
      cancelled = true;
    };
  }, [title?.id, title?.canonicalTitle, title?.year, priority]);

  return title ? snapshot : undefined;
}
