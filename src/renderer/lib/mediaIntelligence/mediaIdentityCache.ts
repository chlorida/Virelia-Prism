import type { MediaItem } from '../../../shared/types';
import { parseMediaIdentity } from './episodeParser';
import type { ParsedMediaIdentity } from './types';
import { invalidateLibraryTitlesCache } from './libraryTitleService';
import { invalidateSmartUpNextPlanCache } from './smartUpNextPlanCache';
import { perfMark, perfMeasure } from '../perf';
import { perfMarkSmartWarmComplete, perfMarkSmartWarmStart } from '../perfReport';
import { isTauriShell } from '../prismAdapter';
import { readIdentityCache, writeIdentityCache } from '../tauriCommands';

export const PARSER_VERSION = 4;

interface CacheEntry {
  signature: string;
  parsed: ParsedMediaIdentity;
}

const identityCache = new Map<string, CacheEntry>();
const identityDiskPending = new Set<string>();
let folderIndex = new Map<string, MediaItem[]>();

function fileSignature(item: MediaItem): string {
  return `${item.filePath}|${item.fileName}|${item.mtimeMs ?? 0}|${PARSER_VERSION}`;
}

export function clearIdentityParseCache(): void {
  identityCache.clear();
}

export function invalidateIdentityCache(): void {
  clearIdentityParseCache();
  folderIndex = new Map();
  invalidateSmartUpNextPlanCache();
  invalidateLibraryTitlesCache();
}

export function rebuildFolderIndex(media: MediaItem[]): void {
  const next = new Map<string, MediaItem[]>();
  for (const item of media) {
    if (!item.filePath) continue;
    const list = next.get(item.folder) ?? [];
    list.push(item);
    next.set(item.folder, list);
  }
  folderIndex = next;
}

/** Defer folder index rebuild so warm startup can paint rows first. */
export function scheduleDeferredFolderIndex(media: MediaItem[]): void {
  const run = () => rebuildFolderIndex(media);
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    globalThis.setTimeout(run, 0);
  }
}

export function getFolderIndex(): Map<string, MediaItem[]> {
  return folderIndex;
}

function persistIdentityToDisk(item: MediaItem, parsed: ParsedMediaIdentity): void {
  if (!isTauriShell() || identityDiskPending.has(item.id)) return;
  identityDiskPending.add(item.id);
  const mtimeMs = item.mtimeMs ?? 0;
  void writeIdentityCache(item.id, mtimeMs, PARSER_VERSION, parsed).finally(() => {
    identityDiskPending.delete(item.id);
  });
}

async function hydrateIdentityFromDisk(item: MediaItem): Promise<boolean> {
  if (!isTauriShell()) return false;
  const sig = fileSignature(item);
  const hit = identityCache.get(item.id);
  if (hit && hit.signature === sig) return true;
  try {
    const disk = await readIdentityCache(item.id, item.mtimeMs ?? 0, PARSER_VERSION);
    if (!disk) return false;
    identityCache.set(item.id, { signature: sig, parsed: disk });
    return true;
  } catch {
    return false;
  }
}

export function getCachedParsedIdentity(item: MediaItem): ParsedMediaIdentity {
  const sig = fileSignature(item);
  const hit = identityCache.get(item.id);
  if (hit && hit.signature === sig) return hit.parsed;

  const parsed = parseMediaIdentity(item.title, item.fileName);
  identityCache.set(item.id, { signature: sig, parsed });
  persistIdentityToDisk(item, parsed);
  return parsed;
}
export function warmParseCache(items: MediaItem[], limit = 24): void {
  const slice = items.slice(0, limit);
  const run = () => {
    for (const item of slice) getCachedParsedIdentity(item);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1200 });
  } else {
    globalThis.setTimeout(run, 0);
  }
}

const WARM_BATCH = 32;

/** Background identity parse: current → visible → folder → rest of library. */
export function scheduleIdentityWarm(
  allMedia: MediaItem[],
  options: { currentId?: string; visibleIds?: string[]; limit?: number }
): void {
  const limit = options.limit ?? 400;
  const byId = new Map(allMedia.map((m) => [m.id, m]));
  const ordered: MediaItem[] = [];

  if (options.currentId) {
    const cur = byId.get(options.currentId);
    if (cur) ordered.push(cur);
  }
  for (const id of options.visibleIds ?? []) {
    const item = byId.get(id);
    if (item && !ordered.some((x) => x.id === item.id)) ordered.push(item);
  }
  if (ordered[0]) {
    const folder = ordered[0].folder;
    for (const item of allMedia) {
      if (item.folder === folder && !ordered.some((x) => x.id === item.id)) {
        ordered.push(item);
        if (ordered.length >= limit) break;
      }
    }
  }
  for (const item of allMedia) {
    if (ordered.length >= limit) break;
    if (!ordered.some((x) => x.id === item.id)) ordered.push(item);
  }

  let cursor = 0;
  perfMarkSmartWarmStart();

  const tick = async () => {
    const end = Math.min(cursor + WARM_BATCH, ordered.length);
    for (; cursor < end; cursor += 1) {
      const item = ordered[cursor]!;
      const hydrated = await hydrateIdentityFromDisk(item);
      if (!hydrated) getCachedParsedIdentity(item);
    }
    if (cursor < ordered.length) {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => { void tick(); }, { timeout: 900 });
      } else {
        globalThis.setTimeout(() => { void tick(); }, 0);
      }
      return;
    }
    perfMarkSmartWarmComplete();
  };

  const startWarm = () => { void tick(); };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(startWarm, { timeout: 800 });
  } else {
    globalThis.setTimeout(startWarm, 0);
  }
}
