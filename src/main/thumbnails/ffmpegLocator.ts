import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let cached: { available: boolean; path?: string; searched: string[] } | null = null;

function candidatePaths(): string[] {
  const roots = [
    path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
    path.join(process.resourcesPath, 'bin', 'ffmpeg.exe'),
    path.join(app.getAppPath(), 'ffmpeg', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  ];
  return roots;
}

async function probe(binary: string): Promise<boolean> {
  try {
    if (!fs.existsSync(binary)) return false;
    await execFileAsync(binary, ['-version'], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

async function probePath(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('where', ['ffmpeg'], { timeout: 4000, shell: true });
    const first = stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (first && await probe(first)) return first;
  } catch {
    // not on PATH
  }
  return undefined;
}

export async function locateFfmpeg(): Promise<{ available: boolean; path?: string; searched: string[] }> {
  if (cached) return cached;

  const searched = ['ffmpeg (PATH)', ...candidatePaths()];
  const fromPath = await probePath();
  if (fromPath) {
    cached = { available: true, path: fromPath, searched };
    return cached;
  }

  for (const candidate of candidatePaths()) {
    if (await probe(candidate)) {
      cached = { available: true, path: candidate, searched };
      return cached;
    }
  }

  cached = { available: false, searched };
  return cached;
}

export function getCachedFfmpegPath(): string | undefined {
  return cached?.available ? cached.path : undefined;
}
