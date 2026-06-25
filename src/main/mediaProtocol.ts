import { protocol } from 'electron';
import path from 'node:path';
import { isMediaPathAllowed } from './mediaAllowlist';
import { createRangedFileResponse } from './mediaRange';

export const MEDIA_SCHEME = 'prism-media';

export function registerMediaProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true
      }
    }
  ]);
}

export function installMediaProtocolHandler(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const parsed = new URL(request.url);
    const rawPath = parsed.searchParams.get('path');
    if (!rawPath) {
      return new Response('Missing media path', { status: 404 });
    }

    const filePath = path.normalize(decodeURIComponent(rawPath));
    if (!isMediaPathAllowed(filePath)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      return await createRangedFileResponse(filePath, request.headers.get('Range'));
    } catch {
      return new Response('Media file unavailable', { status: 404 });
    }
  });
}

export function toMediaProtocolUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://play/?path=${encodeURIComponent(path.normalize(filePath))}`;
}
