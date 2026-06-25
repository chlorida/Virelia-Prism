import { describe, expect, it } from 'vitest';
import { shouldShowContentModeSwitch } from './contentModeVisibility';

describe('shouldShowContentModeSwitch', () => {
  it('shows on library home and files', () => {
    expect(shouldShowContentModeSwitch({ page: 'home' }, 'library')).toBe(true);
    expect(shouldShowContentModeSwitch({ page: 'files' }, 'library')).toBe(true);
  });

  it('hides outside library shell and on discover', () => {
    expect(shouldShowContentModeSwitch({ page: 'discover' }, 'library')).toBe(false);
    expect(shouldShowContentModeSwitch({ page: 'home' }, 'player')).toBe(false);
    expect(shouldShowContentModeSwitch({ page: 'title', localTitleId: 'x' }, 'library')).toBe(false);
  });
});
