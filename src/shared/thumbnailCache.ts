/** Bump when thumbnail extraction algorithm or layout changes. */
export const THUMB_CACHE_VERSION = 1;

/** Do not retry failed generations until this cooldown elapses (ms). */
export const THUMB_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

export type ThumbnailSizeVariant = 'small' | 'large';

export interface ThumbnailCacheMeta {
  version: number;
  cacheKey: string;
  sourcePath: string;
  sourceSize: number;
  sourceMtime: number;
  generatedAt: number;
  smallPath?: string;
  largePath?: string;
  failed?: boolean;
  reason?: string;
  attemptedAt?: number;
  retryAfter?: number;
  palette?: string[];
}

export interface ThumbnailSourceStat {
  path: string;
  size: number;
  mtime: number;
}

/** Browser + Node safe path normalization (no node:path). */
export function normalizeMediaPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase().trim();
}

/** Pure-JS SHA-256 — works in renderer and Electron main without node:crypto. */
function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) & ~63));
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const view = new DataView(withOne.buffer);
  view.setUint32(withOne.length - 4, bitLen, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let i = 0; i < withOne.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = (rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 = (rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((n) => n.toString(16).padStart(8, '0')).join('');
}

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/** Stable cache key from source file identity — never uses mediaId or array index. */
export function computeThumbnailCacheKey(
  filePath: string,
  size: number,
  mtime: number
): string {
  const normalized = normalizeMediaPath(filePath);
  return sha256Hex(`${THUMB_CACHE_VERSION}|${normalized}|${size}|${mtime}`).slice(0, 24);
}

export function isFailureMetaValid(meta: ThumbnailCacheMeta, now = Date.now()): boolean {
  if (!meta.failed) return false;
  if (meta.retryAfter != null && now < meta.retryAfter) return true;
  return meta.attemptedAt != null && now - meta.attemptedAt < THUMB_FAILURE_COOLDOWN_MS;
}

export function isThumbnailMetaValid(
  meta: ThumbnailCacheMeta,
  stat: ThumbnailSourceStat
): boolean {
  if (meta.version !== THUMB_CACHE_VERSION) return false;
  if (normalizeMediaPath(meta.sourcePath) !== normalizeMediaPath(stat.path)) return false;
  if (meta.sourceSize !== stat.size) return false;
  if (meta.sourceMtime !== stat.mtime) return false;
  if (meta.failed) return false;
  return true;
}
