import { describe, expect, it } from 'vitest';
import { resolveImportResultToast } from './importToast';
import type { LibraryScanResult } from '../../shared/types';

const t = (key: string) => key;

describe('resolveImportResultToast', () => {
  it('returns folderAlreadyIndexed message', () => {
    const result: LibraryScanResult = {
      folders: ['D:/Anime'],
      media: [],
      scannedAt: '',
      folderAlreadyIndexed: true,
    };
    expect(resolveImportResultToast(result, t)).toBe('toast.folderAlreadyIndexed');
  });

  it('returns noNewMediaFound when nothing was added', () => {
    const result: LibraryScanResult = {
      folders: [],
      media: [],
      scannedAt: '',
      importStats: { added: 0, skipped: 3 },
    };
    expect(resolveImportResultToast(result, t)).toBe('toast.noNewMediaFound');
  });
});
