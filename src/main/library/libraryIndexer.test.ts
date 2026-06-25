import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LibraryIndexer, detectMediaKind, isSupportedMediaFile } from './libraryIndexer';

describe('libraryIndexer media detection', () => {
  it('detects supported audio and video extensions case-insensitively', () => {
    expect(isSupportedMediaFile('track.FLAC')).toBe(true);
    expect(isSupportedMediaFile('clip.mkv')).toBe(true);
    expect(isSupportedMediaFile('notes.txt')).toBe(false);
    expect(detectMediaKind('song.m4a')).toBe('audio');
    expect(detectMediaKind('movie.webm')).toBe('video');
    expect(isSupportedMediaFile('AcceleratedRendererSettings.d.ts')).toBe(false);
    expect(detectMediaKind('action.d.ts')).toBeUndefined();
    expect(isSupportedMediaFile('D:/dvaaudiofilters/wav/80azright.wav')).toBe(false);
  });

  it('scans folders recursively and returns stable media metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'virelia-prism-'));
    const nested = path.join(root, 'Album');
    await mkdir(nested);
    await writeFile(path.join(root, 'Intro.mp3'), 'demo');
    await writeFile(path.join(nested, 'Scene.MKV'), 'demo');
    await writeFile(path.join(nested, 'Cover.jpg'), 'ignored');

    const result = await new LibraryIndexer().scanFolders([root]);

    expect(result.media).toHaveLength(2);
    expect(result.media.map((item) => item.title).sort()).toEqual(['Intro', 'Scene']);
    expect(result.media.map((item) => item.kind).sort()).toEqual(['audio', 'video']);
  });
});
