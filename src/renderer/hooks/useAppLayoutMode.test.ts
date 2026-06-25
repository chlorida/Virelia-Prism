import { describe, expect, it } from 'vitest';
import { LAYOUT_BREAKPOINTS, resolveAppLayoutMode } from './useAppLayoutMode';

describe('resolveAppLayoutMode', () => {
  it('uses docked three-column layout at 1920', () => {
    expect(resolveAppLayoutMode(1920)).toBe('wide');
    expect(resolveAppLayoutMode(1450)).toBe('wide');
  });

  it('uses drawer queue layout at 1280', () => {
    expect(resolveAppLayoutMode(1280)).toBe('medium');
  });

  it('uses narrow layout below 1100', () => {
    expect(resolveAppLayoutMode(LAYOUT_BREAKPOINTS.mediumMin - 1)).toBe('narrow');
  });
});
