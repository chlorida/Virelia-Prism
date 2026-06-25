import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import {
  TITLE_METADATA_CACHE_VERSION,
  type TitleMetadataImageResult,
  type TitleMetadataRecord,
} from '../../shared/titleMetadataTypes';
import { addMediaAllowlistRoot } from '../mediaAllowlist';
import { toMediaProtocolUrl } from '../mediaProtocol';

const IMAGE_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const imageFailures = new Map<string, number>();

function cacheRoot(): string {
  const root = path.join(app.getPath('userData'), 'metadata-cache');
  fs.mkdirSync(path.join(root, 'titles'), { recursive: true });
  fs.mkdirSync(path.join(root, 'images', 'posters'), { recursive: true });
  fs.mkdirSync(path.join(root, 'images', 'backdrops'), { recursive: true });
  fs.mkdirSync(path.join(root, 'images', 'banners'), { recursive: true });
  fs.mkdirSync(path.join(root, 'images', 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(root, 'images', 'trailers'), { recursive: true });
  addMediaAllowlistRoot(root);
  return root;
}

function titleRecordPath(cacheKey: string): string {
  const safe = cacheKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return path.join(cacheRoot(), 'titles', `${safe}.json`);
}

function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function imageExtFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext === '.png' || ext === '.webp' || ext === '.jpg' || ext === '.jpeg') {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  } catch {
    // ignore
  }
  return '.jpg';
}

function downloadToFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { timeout: 20000 }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadToFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('timeout'));
    });
  });
}

export function readTitleMetadataRecord(cacheKey: string): TitleMetadataRecord | null {
  try {
    const filePath = titleRecordPath(cacheKey);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as TitleMetadataRecord;
    if (parsed.version !== TITLE_METADATA_CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTitleMetadataRecord(record: TitleMetadataRecord): void {
  const filePath = titleRecordPath(record.cacheKey);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 0), 'utf8');
}

function imageSubdir(kind: 'poster' | 'backdrop' | 'banner' | 'screenshot' | 'trailer'): string {
  if (kind === 'poster') return 'posters';
  if (kind === 'backdrop') return 'backdrops';
  if (kind === 'banner') return 'banners';
  if (kind === 'trailer') return 'trailers';
  return 'screenshots';
}

export function deleteTitleMetadataRecord(cacheKey: string): void {
  try {
    const filePath = titleRecordPath(cacheKey);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

export async function cacheMetadataImage(
  remoteUrl: string,
  kind: 'poster' | 'backdrop' | 'banner' | 'screenshot' | 'trailer'
): Promise<TitleMetadataImageResult> {
  if (!remoteUrl?.startsWith('http')) return { failed: true };

  const failKey = `${kind}:${remoteUrl}`;
  const failedAt = imageFailures.get(failKey);
  if (failedAt && Date.now() - failedAt < IMAGE_FAILURE_COOLDOWN_MS) {
    return { failed: true };
  }

  const ext = imageExtFromUrl(remoteUrl);
  const fileName = `${hashUrl(remoteUrl)}${ext}`;
  const localPath = path.join(cacheRoot(), 'images', imageSubdir(kind), fileName);

  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 400) {
    return { localPath, displayUrl: toMediaProtocolUrl(localPath) };
  }

  try {
    const tmp = `${localPath}.part`;
    await downloadToFile(remoteUrl, tmp);
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 400) {
      fs.unlinkSync(tmp);
      throw new Error('image too small');
    }
    fs.renameSync(tmp, localPath);
    return { localPath, displayUrl: toMediaProtocolUrl(localPath) };
  } catch {
    imageFailures.set(failKey, Date.now());
    return { failed: true };
  }
}
