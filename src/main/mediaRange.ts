import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo'
};

export function mediaMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function parseByteRange(rangeHeader: string, fileSize: number): [number, number] | undefined {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || fileSize <= 0) return undefined;

  const [, startText, endText] = match;
  let start = 0;
  let end = fileSize - 1;

  if (startText === '' && endText === '') return undefined;

  if (startText === '') {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return undefined;
    start = Math.max(0, fileSize - suffixLength);
  } else {
    start = Number(startText);
    if (!Number.isFinite(start) || start < 0) return undefined;
    if (endText !== '') {
      end = Number(endText);
      if (!Number.isFinite(end)) return undefined;
    }
  }

  if (end >= fileSize) end = fileSize - 1;
  if (start > end) return undefined;
  return [start, end];
}

export async function createRangedFileResponse(
  filePath: string,
  rangeHeader: string | null
): Promise<Response> {
  const normalizedPath = path.normalize(filePath);
  const fileStat = await stat(normalizedPath);
  const fileSize = fileStat.size;
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': mediaMimeType(normalizedPath)
  });

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, fileSize);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` }
      });
    }

    {
      const [start, end] = range;
      const contentLength = end - start + 1;
      headers.set('Content-Length', String(contentLength));
      headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);

      const stream = createReadStream(normalizedPath, { start, end });
      return new Response(Readable.toWeb(stream) as unknown as BodyInit, { status: 206, headers });
    }
  }

  headers.set('Content-Length', String(fileSize));
  const stream = createReadStream(normalizedPath);
  return new Response(Readable.toWeb(stream) as unknown as BodyInit, { status: 200, headers });
}
