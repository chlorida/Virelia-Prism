import { describe, expect, it } from 'vitest';
import { LAYOUT_BREAKPOINTS, resolveAppLayoutMode } from '../hooks/useAppLayoutMode';

describe('layout breakpoints', () => {
  it('uses wide layout at 1450+', () => {
    expect(resolveAppLayoutMode(1920)).toBe('wide');
    expect(resolveAppLayoutMode(LAYOUT_BREAKPOINTS.wideMin)).toBe('wide');
  });

  it('uses drawer layout between 1100 and 1449', () => {
    expect(resolveAppLayoutMode(1449)).toBe('medium');
    expect(resolveAppLayoutMode(1280)).toBe('medium');
    expect(resolveAppLayoutMode(1100)).toBe('medium');
  });

  it('uses narrow layout below 1100', () => {
    expect(resolveAppLayoutMode(1099)).toBe('narrow');
    expect(resolveAppLayoutMode(500)).toBe('narrow');
  });
});
