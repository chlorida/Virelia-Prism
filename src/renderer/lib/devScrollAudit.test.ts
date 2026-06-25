import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isScrollAuditEnabled } from './devScrollAudit';

describe('devScrollAudit', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is disabled unless dev flag is set', () => {
    expect(isScrollAuditEnabled()).toBe(false);
    vi.mocked(localStorage.getItem).mockReturnValue('1');
    expect(isScrollAuditEnabled()).toBe(import.meta.env.DEV);
  });
});
