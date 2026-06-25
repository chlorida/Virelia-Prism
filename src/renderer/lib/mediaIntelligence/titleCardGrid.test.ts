import { describe, expect, it } from 'vitest';
import { CARD_MAX_W, CARD_MIN_W, computePosterGridLayout } from './titleCardGrid';

describe('computePosterGridLayout', () => {
  it('fits multiple fixed-width poster cards on desktop widths', () => {
    const at1600 = computePosterGridLayout(820, false);
    expect(at1600.columns).toBeGreaterThanOrEqual(3);
    expect(at1600.cardWidth).toBeLessThanOrEqual(CARD_MAX_W);
    expect(at1600.cardWidth).toBeGreaterThanOrEqual(CARD_MIN_W);

    const at1366 = computePosterGridLayout(720, false);
    expect(at1366.columns).toBeGreaterThanOrEqual(3);

    const at1280 = computePosterGridLayout(580, false);
    expect(at1280.columns).toBeGreaterThanOrEqual(2);
  });

  it('does not stretch cards beyond the max width', () => {
    const layout = computePosterGridLayout(1200, false);
    expect(layout.cardWidth).toBeLessThanOrEqual(CARD_MAX_W);
  });

  it('uses a single full-width row in compact mode', () => {
    const layout = computePosterGridLayout(900, true);
    expect(layout.columns).toBe(1);
    expect(layout.cardWidth).toBe(900);
  });
});
