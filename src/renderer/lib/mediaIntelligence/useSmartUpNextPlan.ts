import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import type { MediaItem } from '../../../shared/types';
import type { UiLocale } from '../../../shared/i18n';
import type { UiLanguagePreference } from '../../../shared/types';
import { perfMark, perfMeasure } from '../perf';
import { resolveEffectiveMediaLanguage } from './languageResolution';
import { scheduleDeferredFolderIndex, warmParseCache } from './mediaIdentityCache';
import { collectRecommendationCandidates } from './recommendationCandidates';
import { buildSmartUpNextPlan } from './smartUpNextService';
import {
  getCachedSmartUpNextPlan,
  SMART_UP_NEXT_ENGINE_VERSION,
  type SmartUpNextMemoKey,
} from './smartUpNextPlanCache';
import type { SmartUpNextPlan } from './types';

export function useSmartUpNextPlan(options: {
  current: MediaItem | undefined;
  mediaById: Map<string, MediaItem>;
  historyItems: MediaItem[];
  uiLanguage: UiLanguagePreference;
  metadataLanguage?: UiLanguagePreference;
  uiLocale: UiLocale;
  mediaIndexKey: string;
}): SmartUpNextPlan {
  const language = resolveEffectiveMediaLanguage({
    uiLanguage: options.uiLanguage,
    metadataLanguage: options.metadataLanguage,
    uiLocale: options.uiLocale,
  });

  const folderIndexKeyRef = useRef('');
  if (folderIndexKeyRef.current !== options.mediaIndexKey) {
    scheduleDeferredFolderIndex([...options.mediaById.values()]);
    folderIndexKeyRef.current = options.mediaIndexKey;
  }

  const plan = useMemo(() => {
    if (!options.current) {
      return {
        currentIdentity: null,
        displayIdentity: null,
        series: null,
        hero: null,
        sections: [],
      } satisfies SmartUpNextPlan;
    }

    perfMark('upnext-start');
    const memoKey: SmartUpNextMemoKey = {
      currentItemId: options.current.id,
      currentItemPath: options.current.filePath,
      mediaIndexVersion: options.mediaIndexKey,
      language,
      historyVersion: String(options.historyItems.length),
      queueVersion: '0',
      engineVersion: SMART_UP_NEXT_ENGINE_VERSION,
    };
    const result = getCachedSmartUpNextPlan(memoKey, () => {
      const candidates = collectRecommendationCandidates(
        options.current!,
        options.historyItems,
        options.mediaById
      );
      return buildSmartUpNextPlan(
        options.current!,
        candidates,
        options.historyItems,
        language
      );
    });
    perfMeasure('upnext-compute', 'upnext-start');
    return result;
  }, [
    options.current?.id,
    options.current?.filePath,
    options.historyItems,
    options.mediaIndexKey,
    language,
  ]);

  const deferredPlan = useDeferredValue(plan);

  useEffect(() => {
    if (!options.current) return;
    const warm: MediaItem[] = [];
    if (deferredPlan.hero) warm.push(deferredPlan.hero.item);
    for (const section of deferredPlan.sections) {
      for (const entry of section.entries.slice(0, 6)) warm.push(entry.item);
    }
    warm.push(options.current);
    warmParseCache(warm, 16);
  }, [options.current?.id, deferredPlan, language]);

  return deferredPlan;
}
