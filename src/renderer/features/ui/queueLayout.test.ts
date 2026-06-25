import { describe, expect, it } from 'vitest';
import { isQueueDocked, isQueueDrawerMode, LAYOUT_BREAKPOINTS } from './queueLayout';
import { resolveAppLayoutMode } from '../../hooks/useAppLayoutMode';

describe('queueLayout', () => {
  it('docks queue at wide breakpoint', () => {
    expect(resolveAppLayoutMode(1920)).toBe('wide');
    expect(isQueueDocked('wide')).toBe(true);
    expect(isQueueDrawerMode('wide')).toBe(false);
  });

  it('uses drawer between medium and wide', () => {
    expect(resolveAppLayoutMode(1280)).toBe('medium');
    expect(isQueueDocked('medium')).toBe(false);
    expect(isQueueDrawerMode('medium')).toBe(true);
  });

  it('uses drawer below medium', () => {
    expect(resolveAppLayoutMode(800)).toBe('narrow');
    expect(isQueueDrawerMode('narrow')).toBe(true);
  });

  it('wide threshold is 1450', () => {
    expect(LAYOUT_BREAKPOINTS.wideMin).toBe(1450);
    expect(resolveAppLayoutMode(1449)).toBe('medium');
    expect(resolveAppLayoutMode(1450)).toBe('wide');
  });
});
