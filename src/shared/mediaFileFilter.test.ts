import { describe, expect, it } from 'vitest';
import {
  classifyMediaFile,
  getExtensionInfo,
  shouldIncludeInLibrary,
} from './mediaFileFilter';

describe('mediaFileFilter', () => {
  it('A: .d.ts is never media', () => {
    for (const name of [
      'AcceleratedRendererSettings.d.ts',
      'action.d.ts',
      'AddCaptionsStartPoint.d.ts',
    ]) {
      const result = classifyMediaFile(`C:/dev/types/${name}`, name);
      expect(result.isMediaCandidate).toBe(false);
      expect(result.skipReason).toBe('source-code-file');
      expect(result.kind).toBeNull();
      expect(shouldIncludeInLibrary(`C:/dev/types/${name}`, name)).toBe(false);
    }
  });

  it('B: .d.ts is not parsed as .ts', () => {
    const info = getExtensionInfo('AcceleratedRendererSettings.d.ts');
    expect(info.compoundExtension).toBe('.d.ts');
    expect(info.compoundExtension).not.toBe('.ts');
  });

  it('C: short wav in asset folder is skipped', () => {
    const path = 'D:/Adobe/dvaaudiofilters/wav/80azright.wav';
    const result = classifyMediaFile(path, '80azright.wav');
    expect(result.skipReason).toBe('short-sfx');
    expect(result.isMediaCandidate).toBe(false);
    expect(shouldIncludeInLibrary(path, '80azright.wav')).toBe(false);
  });

  it('skips codec test vectors from tests/data', () => {
    const path = 'D:/Programs/Virelia Prism/tests/data/Test-44100hz-2ch-32bit-Float-Be.wav';
    const result = classifyMediaFile(path, 'Test-44100hz-2ch-32bit-Float-Be.wav');
    expect(result.skipReason).toBe('test-fixture');
    expect(result.isMediaCandidate).toBe(false);
  });

  it('keeps real mkv episodes', () => {
    const path = 'D:/Anime/Higurashi Gou - 01.mkv';
    const result = classifyMediaFile(path, 'Higurashi Gou - 01.mkv');
    expect(result.isMediaCandidate).toBe(true);
    expect(result.kind).toBe('video');
  });

  it('F: migration removes .d.ts paths from library inclusion', () => {
    expect(
      shouldIncludeInLibrary('C:/types/AcceleratedRendererSettings.d.ts', 'AcceleratedRendererSettings.d.ts'),
    ).toBe(false);
  });
});
