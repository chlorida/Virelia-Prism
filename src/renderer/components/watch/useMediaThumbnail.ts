import { useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../../../shared/types';
import type { ThumbnailApiRecord } from '../../../shared/prismApi.types';
import {
  ensureThumbnail,
  getThumbnailState,
  isThumbnailLoading,
  resolveThumbUrl,
  subscribeThumbnails,
  type ThumbnailPriority,
} from '../../lib/mediaIntelligence/thumbnailService';

export interface UseMediaThumbnailOptions {
  priority?: ThumbnailPriority;
  variant?: 'small' | 'large';
  lazy?: boolean;
  /** When false, skips ffmpeg thumbnail generation (e.g. while loading online poster). */
  enabled?: boolean;
}

export function useMediaThumbnail(
  item: MediaItem | undefined,
  options: UseMediaThumbnailOptions = {}
) {
  const { priority = 'normal', variant = 'small', lazy = false, enabled = true } = options;
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [record, setRecord] = useState<ThumbnailApiRecord | undefined>(() =>
    item ? getThumbnailState(item.id) : undefined
  );

  useEffect(() => {
    if (!lazy || !item) {
      setVisible(true);
      return;
    }
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, item?.id]);

  const url = item
    ? (record?.status === 'ready'
      ? (variant === 'large' ? (record.largeUrl ?? record.url) : record.url) ?? resolveThumbUrl(item, variant)
      : resolveThumbUrl(item, variant))
    : undefined;

  const terminal = record?.status === 'ready'
    || record?.status === 'failed'
    || record?.status === 'ffmpeg-missing'
    || record?.status === 'unsupported'
    || record?.status === 'file-missing'
    || record?.status === 'path-not-allowed';
  const loading = item ? !terminal && (isThumbnailLoading(item) || (!record && visible)) : false;

  useEffect(() => {
    if (!item || !visible || !enabled) return;

    const cached = getThumbnailState(item.id);
    if (cached) setRecord(cached);

    let cancelled = false;
    void ensureThumbnail(item, priority).then((next) => {
      if (!cancelled) setRecord(next);
    });

    const unsub = subscribeThumbnails((mediaId) => {
      if (mediaId !== item.id) return;
      setRecord(getThumbnailState(item.id));
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [item?.id, visible, priority, enabled]);

  return { url, record, loading, rootRef };
}
