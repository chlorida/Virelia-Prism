import type { MediaItem } from '../../shared/types';
import type { MediaDisplayLanguage } from './mediaIntelligence/languageResolution';
import {
  resolveMediaDisplay,
  resolveMediaDisplayTitle,
  type MediaDisplay,
  type MediaDisplayContext,
} from './mediaIntelligence/mediaDisplay';

export type { MediaDisplay, MediaDisplayContext };
export { resolveMediaDisplay, resolveMediaDisplayTitle };

export interface DisplayTitle {
  title: string;
  shortTitle: string;
  chips: string[];
}

export interface ResolveMediaDisplayTitleOptions {
  short?: boolean;
}

export function parseDisplayTitle(rawTitle: string, fileName?: string, language?: string): DisplayTitle {
  const name = fileName ?? rawTitle;
  const fakeItem: MediaItem = {
    id: 'parse-temp',
    filePath: '',
    fileName: name,
    folder: '',
    title: name,
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
  };
  const display = resolveMediaDisplay(fakeItem, { language });
  return { title: display.title, shortTitle: display.shortTitle, chips: display.chips };
}

export function parseDisplayTitleFromItem(item: MediaItem, language?: string): DisplayTitle {
  const display = resolveMediaDisplay(item, { language });
  return { title: display.title, shortTitle: display.shortTitle, chips: display.chips };
}

export function resolveMediaDisplayTitleWithOptions(
  item: MediaItem | null | undefined,
  language?: MediaDisplayLanguage | string,
  options?: ResolveMediaDisplayTitleOptions
): string {
  if (!item) return '';
  const display = resolveMediaDisplay(item, { language });
  return options?.short ? display.shortTitle : display.title;
}
