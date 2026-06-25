import { describe, expect, it } from 'vitest';
import {
  isLibraryBlockingLoad,
  isLibraryBootReady,
  shouldShowLibraryRecovery,
} from './libraryBootState';

describe('libraryBootState', () => {
  it('ready states are not blocking', () => {
    expect(isLibraryBootReady('readyFromSnapshot')).toBe(true);
    expect(isLibraryBootReady('readyAndScanning')).toBe(true);
    expect(isLibraryBlockingLoad('readyFromSnapshot', false)).toBe(false);
  });

  it('loading snapshot blocks without media', () => {
    expect(isLibraryBlockingLoad('loadingSnapshot', false)).toBe(true);
    expect(isLibraryBlockingLoad('loadingSnapshot', true)).toBe(false);
  });

  it('scan failed shows recovery', () => {
    expect(shouldShowLibraryRecovery('scanFailed')).toBe(true);
    expect(shouldShowLibraryRecovery('ready')).toBe(false);
  });
});
