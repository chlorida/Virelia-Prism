import type { MediaItem } from '../../shared/types';
import { buildSearchBlobFromItem, SEARCH_INDEX_VERSION } from './mediaIntelligence/searchDocument';
import { formatFolderLabelForDisplay } from './pathDisplay';
import { perfSync } from './perf';

/** @deprecated Use {@link buildSearchBlobFromItem} for full display/alias indexing. */
export function buildSearchTextLegacy(item: Pick<MediaItem, 'fileName' | 'folder' | 'title' | 'artist' | 'album' | 'tags'>): string {
  return [
    item.fileName,
    item.folder,
    item.title,
    item.artist,
    item.album,
    ...item.tags
  ].map((v) => (v ?? '').toLocaleLowerCase()).join(' ');
}

export function buildSearchText(item: MediaItem): string {
  return buildSearchBlobFromItem(item);
}

export { SEARCH_INDEX_VERSION };

export function buildFolderLabel(folder: string): string {
  return formatFolderLabelForDisplay(folder);
}

export function withMediaIndexFields(item: MediaItem): MediaItem {
  return {
    ...item,
    searchText: buildSearchText(item),
    folderLabel: item.folderLabel ?? buildFolderLabel(item.folder)
  };
}

/** Fast path for startup: folder labels only; search text built lazily in {@link matchesQuery}. */
export function indexMediaLibraryQuick(items: MediaItem[]): MediaItem[] {
  return perfSync('library-index-quick', () => {
    const folderCache = new Map<string, string>();
    return items.map((item) => {
      let folderLabel = folderCache.get(item.folder);
      if (!folderLabel) {
        folderLabel = buildFolderLabel(item.folder);
        folderCache.set(item.folder, folderLabel);
      }
      return { ...item, folderLabel };
    });
  });
}

/** Full index including precomputed searchText (optional background warm). */
export function enrichMediaSearchIndex(items: MediaItem[]): MediaItem[] {
  return perfSync('library-index-search', () => items.map((item) => withMediaIndexFields(item)));
}

export function indexMediaLibrary(items: MediaItem[]): MediaItem[] {
  return indexMediaLibraryQuick(items);
}

const SEARCH_INDEX_CHUNK = 2500;

/** Warm searchText in idle chunks without blocking the UI thread. */
export function scheduleBackgroundSearchIndex(
  items: MediaItem[],
  onProgress?: (indexed: MediaItem[]) => void
): void {
  if (items.length === 0) return;
  let cursor = 0;
  const working = items.slice();

  const runChunk = () => {
    const end = Math.min(cursor + SEARCH_INDEX_CHUNK, working.length);
    for (; cursor < end; cursor += 1) {
      working[cursor] = withMediaIndexFields(working[cursor]!);
    }
    if (cursor < working.length) {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(runChunk, { timeout: 800 });
      } else {
        globalThis.setTimeout(runChunk, 0);
      }
      return;
    }
    onProgress?.(working);
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(runChunk, { timeout: 1200 });
  } else {
    globalThis.setTimeout(runChunk, 0);
  }
}

export function buildMediaById(items: MediaItem[]): Map<string, MediaItem> {
  return new Map(items.map((item) => [item.id, item]));
}

export function sortMediaByDurationDesc(items: MediaItem[]): MediaItem[] {
  const withDuration = items.filter((item) => (item.durationSeconds ?? 0) > 0);
  if (withDuration.length < 2) return withDuration;
  return withDuration.slice().sort((left, right) => (right.durationSeconds ?? 0) - (left.durationSeconds ?? 0));
}
