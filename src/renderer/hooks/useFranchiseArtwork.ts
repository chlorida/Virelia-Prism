import { useEffect, useSyncExternalStore } from 'react';
import {
  getFranchiseArtworkPoster,
  requestFranchiseArtworkPoster,
  subscribeFranchiseArtwork,
} from '../lib/mediaIntelligence/franchise/franchiseArtworkService';

export function useFranchiseArtworkPoster(
  artworkKey: string | undefined,
  searchTitle: string | undefined,
  enabled = true
): string | undefined {
  const poster = useSyncExternalStore(
    subscribeFranchiseArtwork,
    () => (artworkKey ? getFranchiseArtworkPoster(artworkKey) : undefined),
    () => undefined
  );

  useEffect(() => {
    if (!enabled || !artworkKey) return;
    const query = searchTitle?.trim();
    if (!query) return;
    requestFranchiseArtworkPoster(artworkKey, query);
  }, [artworkKey, searchTitle, enabled]);

  return poster;
}
