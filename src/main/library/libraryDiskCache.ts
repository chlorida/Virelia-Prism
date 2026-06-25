import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { LibraryScanResult, LibrarySnapshotCounts } from '../../shared/types';

const CACHE_VERSION = 2;

interface DiskLibraryCache {
  version: number;
  folders: string[];
  media: LibraryScanResult['media'];
  scannedAt: string;
  counts?: LibrarySnapshotCounts;
  mediaIndexVersion?: number;
}

function cachePath(): string {
  return path.join(app.getPath('userData'), 'library-index-cache.json');
}

function foldersKey(folders: string[]): string {
  return folders.map((f) => path.normalize(f).toLowerCase()).sort().join('|');
}

function computeCounts(media: LibraryScanResult['media']): LibrarySnapshotCounts {
  let audio = 0;
  let video = 0;
  for (const item of media) {
    if (item.kind === 'audio') audio += 1;
    else video += 1;
  }
  return { all: media.length, audio, video };
}

function parseDiskCache(raw: string, expectedFolders: string[]): LibraryScanResult | null {
  const parsed = JSON.parse(raw) as DiskLibraryCache;
  if (parsed.version !== CACHE_VERSION && parsed.version !== 1) return null;
  if (foldersKey(parsed.folders) !== foldersKey(expectedFolders)) return null;
  const counts = parsed.counts ?? computeCounts(parsed.media);
  return {
    folders: parsed.folders,
    media: parsed.media,
    scannedAt: parsed.scannedAt,
    counts,
    mediaIndexVersion: parsed.mediaIndexVersion ?? 1,
  };
}

export function readLibraryDiskCache(expectedFolders: string[]): LibraryScanResult | null {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8');
    return parseDiskCache(raw, expectedFolders);
  } catch {
    return null;
  }
}

export async function readLibraryDiskCacheAsync(expectedFolders: string[]): Promise<LibraryScanResult | null> {
  try {
    const raw = await fsp.readFile(cachePath(), 'utf8');
    return parseDiskCache(raw, expectedFolders);
  } catch {
    return null;
  }
}

export function writeLibraryDiskCache(result: LibraryScanResult): void {
  try {
    const counts = result.counts ?? computeCounts(result.media);
    const payload: DiskLibraryCache = {
      version: CACHE_VERSION,
      folders: result.folders,
      media: result.media,
      scannedAt: result.scannedAt,
      counts,
      mediaIndexVersion: result.mediaIndexVersion ?? 1,
    };
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify(payload));
  } catch (error) {
    console.warn('[Virelia] library disk cache write failed', error);
  }
}
