import { useEffect, useState } from 'react';
import type { TitleMediaAsset } from '../../shared/titleMetadataTypes';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { buildLocalEpisodeFrames } from '../lib/mediaIntelligence/localEpisodeFrameService';

export function useTitleLocalFrames(title: LibraryTitle | undefined, refreshEpoch = 0): {
  frames: TitleMediaAsset[];
  loading: boolean;
} {
  const [frames, setFrames] = useState<TitleMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!title) {
      setFrames([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void buildLocalEpisodeFrames(title).then((next) => {
      if (cancelled) return;
      setFrames(next);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setFrames([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [title?.id, refreshEpoch]);

  return { frames, loading };
}
