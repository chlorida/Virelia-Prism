import { describe, expect, it } from 'vitest';
import { formatFolderLabelForDisplay, formatPathForDisplay } from './pathDisplay';

describe('pathDisplay', () => {
  it('removes extended path prefix', () => {
    expect(formatPathForDisplay('\\\\?\\D:\\Downloads\\Anime\\file.mkv')).toBe(
      'D:/Downloads/Anime/file.mkv'
    );
  });

  it('hides junk drive-only folder paths', () => {
    expect(formatFolderLabelForDisplay('\\\\?\\D:\\')).toBe('');
    expect(formatFolderLabelForDisplay('D:\\')).toBe('');
  });

  it('shows compact folder label', () => {
    expect(formatFolderLabelForDisplay('D:/Downloads/Higurashi no Naku Koro ni Sotsu')).toMatch(
      /Higurashi|Sotsu/
    );
  });
});
