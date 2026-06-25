// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isVideoInteractiveTarget } from './videoPlayerInteraction';

describe('isVideoInteractiveTarget', () => {
  it('detects buttons as interactive', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    expect(isVideoInteractiveTarget(btn)).toBe(true);
    btn.remove();
  });

  it('does not treat plain div as interactive', () => {
    const div = document.createElement('div');
    expect(isVideoInteractiveTarget(div)).toBe(false);
  });
});
