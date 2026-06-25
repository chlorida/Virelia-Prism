import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('thumbnail UI', () => {
  it('MediaThumb source never renders ffmpeg label', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/watch/MediaThumb.tsx'),
      'utf8'
    );
    expect(src).not.toMatch(/['"]ffmpeg['"]/);
    expect(src).not.toMatch(/statusHint/);
  });

  it('useMediaThumbnail avoids unstable object deps beyond item id', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/watch/useMediaThumbnail.ts'),
      'utf8'
    );
    expect(src).toContain('[item?.id, visible, priority, enabled]');
    expect(src).not.toContain('item?.filePath');
  });

  it('renderer thumbnail service deduplicates in-flight cache keys', () => {
    const src = readFileSync(
      resolve(__dirname, './thumbnailService.ts'),
      'utf8'
    );
    expect(src).toContain('inFlight');
    expect(src).toContain('failureCooldownUntil');
  });
});
