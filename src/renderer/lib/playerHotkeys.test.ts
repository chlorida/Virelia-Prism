import { describe, expect, it } from 'vitest';
import { isPlayPauseKey, shouldIgnorePlayerHotkey } from './playerHotkeys';

function keyEvent(target: HTMLElement): KeyboardEvent {
  return { target } as unknown as KeyboardEvent;
}

describe('playerHotkeys', () => {
  it('detects Space and K as play/pause keys', () => {
    expect(isPlayPauseKey({ code: 'Space', key: ' ' } as KeyboardEvent)).toBe(true);
    expect(isPlayPauseKey({ code: 'KeyK', key: 'k' } as KeyboardEvent)).toBe(true);
  });

  it('ignores hotkeys inside form controls', () => {
    const el = { closest: () => el } as unknown as HTMLElement;
    expect(shouldIgnorePlayerHotkey(keyEvent(el))).toBe(true);
  });

  it('ignores hotkeys inside data-ignore-player-hotkeys', () => {
    const el = { closest: () => el } as unknown as HTMLElement;
    expect(shouldIgnorePlayerHotkey(keyEvent(el))).toBe(true);
  });

  it('allows hotkeys on generic targets', () => {
    const el = { closest: () => null } as unknown as HTMLElement;
    expect(shouldIgnorePlayerHotkey(keyEvent(el))).toBe(false);
  });
});
