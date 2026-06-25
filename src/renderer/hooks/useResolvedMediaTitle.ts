import { useMemo } from 'react';
import type { MediaItem } from '../../shared/types';
import { resolveMediaDisplay } from '../lib/mediaIntelligence/mediaDisplay';
import { useMediaDisplayLanguage } from './useMediaDisplayLanguage';

export function useResolvedMediaTitle(
  item: MediaItem | null | undefined,
  options?: { short?: boolean }
): string {
  const language = useMediaDisplayLanguage();
  return useMemo(() => {
    const display = resolveMediaDisplay(item, { language });
    return options?.short ? display.shortTitle : display.title;
  }, [item?.id, item?.filePath, item?.fileName, item?.title, language, options?.short]);
}

export function useMediaDisplay(item: MediaItem | null | undefined) {
  const language = useMediaDisplayLanguage();
  return useMemo(
    () => resolveMediaDisplay(item, { language }),
    [item?.id, item?.filePath, item?.fileName, item?.title, language]
  );
}
