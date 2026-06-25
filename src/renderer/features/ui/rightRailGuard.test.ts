import { describe, expect, it } from 'vitest';
import { getSmartRightPanelMountCount, registerSmartRightPanelMount } from './rightRailGuard';

describe('rightRailGuard', () => {
  it('tracks SmartRightPanel mount count', () => {
    const unmountA = registerSmartRightPanelMount();
    const unmountB = registerSmartRightPanelMount();
    expect(getSmartRightPanelMountCount()).toBe(2);
    unmountA();
    unmountB();
    expect(getSmartRightPanelMountCount()).toBe(0);
  });
});
