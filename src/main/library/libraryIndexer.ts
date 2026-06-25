import { readdir, realpath, stat } from 'node:fs/promises';

import path from 'node:path';

import crypto from 'node:crypto';

import type { LibraryScanResult, MediaItem, MediaKind } from '../../shared/types';

import { classifyMediaFile, shouldIncludeInLibrary } from '../../shared/mediaFileFilter';



export const audioExtensions = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac']);

export const videoExtensions = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi']);



const SCAN_CONCURRENCY = 32;



export function detectMediaKind(filePath: string): MediaKind | undefined {

  const fileName = path.basename(filePath);

  return classifyMediaFile(filePath, fileName).kind ?? undefined;

}



export function isSupportedMediaFile(filePath: string): boolean {

  const fileName = path.basename(filePath);

  return shouldIncludeInLibrary(filePath, fileName);

}



function createMediaId(filePath: string): string {

  return crypto.createHash('sha1').update(filePath).digest('hex');

}



function titleFromFile(filePath: string): string {

  const fileName = path.basename(filePath);

  const info = classifyMediaFile(filePath, fileName);

  const stem = fileName.slice(0, fileName.length - (info.compoundExtension.length || 0));

  return stem.replace(/[_-]+/g, ' ').trim();

}



function mediaAddedAt(fileStat: { mtimeMs: number; mtime: Date; birthtime: Date }): string {

  const time = fileStat.mtimeMs > 0 ? fileStat.mtime : fileStat.birthtime;

  return time.toISOString();

}



export function dedupeMediaByPath(items: MediaItem[]): MediaItem[] {

  const byPath = new Map<string, MediaItem>();

  for (const item of items) {

    const key = path.normalize(item.filePath).toLowerCase();

    if (!byPath.has(key)) byPath.set(key, item);

  }

  return Array.from(byPath.values());

}



export async function createMediaItemFromPath(filePath: string): Promise<MediaItem | undefined> {

  const fileName = path.basename(filePath);

  if (!shouldIncludeInLibrary(filePath, fileName)) return undefined;



  const kind = detectMediaKind(filePath);

  if (!kind) return undefined;



  try {

    const fileStat = await stat(filePath);

    return {

      id: createMediaId(filePath),

      filePath,

      fileName,

      folder: path.dirname(filePath),

      title: titleFromFile(filePath),

      tags: [],

      kind,

      addedAt: mediaAddedAt(fileStat),

      favorite: false

    };

  } catch {

    return undefined;

  }

}



export async function createMediaItemsFromPaths(filePaths: string[]): Promise<MediaItem[]> {

  const media: MediaItem[] = [];



  for (const filePath of filePaths) {

    const item = await createMediaItemFromPath(filePath);

    if (item) media.push(item);

  }



  return dedupeMediaByPath(media).sort((left, right) => left.title.localeCompare(right.title));

}



async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {

  const results: R[] = new Array(items.length);

  let index = 0;



  async function run(): Promise<void> {

    while (true) {

      const current = index;

      index += 1;

      if (current >= items.length) break;

      results[current] = await worker(items[current]);

    }

  }



  const runners = Array.from(

    { length: Math.min(concurrency, Math.max(1, items.length)) },

    () => run()

  );

  await Promise.all(runners);

  return results;

}



export class LibraryIndexer {

  async scanFolders(folders: string[]): Promise<LibraryScanResult> {

    const media: MediaItem[] = [];



    for (const folder of folders) {

      try {

        media.push(...await this.scanFolder(folder, new Set()));

      } catch {

        // A single unavailable folder should not block the rest of the library.

      }

    }



    return {

      folders,

      media: dedupeMediaByPath(media).sort((left, right) => left.title.localeCompare(right.title)),

      scannedAt: new Date().toISOString()

    };

  }



  private async scanFolder(folder: string, visited: Set<string>): Promise<MediaItem[]> {

    let resolvedFolder: string;

    try {

      resolvedFolder = await realpath(folder);

    } catch {

      return [];

    }



    const visitKey = resolvedFolder.toLowerCase();

    if (visited.has(visitKey)) return [];

    visited.add(visitKey);



    let entries;

    try {

      entries = await readdir(resolvedFolder, { withFileTypes: true });

    } catch {

      return [];

    }



    const media: MediaItem[] = [];

    const subfolders: string[] = [];



    for (const entry of entries) {

      const filePath = path.join(resolvedFolder, entry.name);

      if (entry.isDirectory()) {

        const dirName = entry.name.toLowerCase();

        if (dirName === 'node_modules' || dirName === 'target' || dirName === '.git') continue;

        subfolders.push(filePath);

        continue;

      }



      if (!entry.isFile() || !isSupportedMediaFile(filePath)) continue;



      const kind = detectMediaKind(filePath);

      if (!kind) continue;



      try {

        const fileStat = await stat(filePath);

        media.push({

          id: createMediaId(filePath),

          filePath,

          fileName: path.basename(filePath),

          folder: path.dirname(filePath),

          title: titleFromFile(filePath),

          tags: [],

          kind,

          addedAt: mediaAddedAt(fileStat),

          favorite: false

        });

      } catch {

        // Skip unreadable files.

      }

    }



    if (subfolders.length > 0) {

      const nested = await mapConcurrent(subfolders, SCAN_CONCURRENCY, (dir) => this.scanFolder(dir, visited));

      for (const batch of nested) media.push(...batch);

    }



    return media;

  }

}



export class LibraryWatcher {

  private watchers: Array<{ close: () => void }> = [];

  private generation = 0;



  watchFolders(folders: string[], onChange: () => void): void {

    this.close();

    const token = ++this.generation;



    for (const folder of folders) {

      void import('node:fs').then(({ watch }) => {

        if (token !== this.generation) return;

        try {

          const watcher = watch(folder, { recursive: true }, onChange);

          if (token !== this.generation) {

            watcher.close();

            return;

          }

          this.watchers.push(watcher);

        } catch {

          // Some platforms restrict recursive watchers; manual refresh remains available.

        }

      }).catch(() => undefined);

    }

  }



  close(): void {

    this.generation += 1;

    for (const watcher of this.watchers) {

      watcher.close();

    }

    this.watchers = [];

  }

}


