import { describe, expect, it } from 'vitest';
import { cleanJunkFromTitle, looksLikeTechnicalParen } from './junkCleaner';

describe('junkCleaner', () => {
  it('strips tuberipper garbage', () => {
    const result = cleanJunkFromTitle('My Track TubeRipper click uploaded');
    expect(result.text.toLowerCase()).not.toContain('tuberipper');
    expect(result.junkTags.some((t) => /tuberipper/i.test(t))).toBe(true);
  });

  it('detects technical parentheses', () => {
    expect(looksLikeTechnicalParen('BD 1280x720 x264 AAC')).toBe(true);
    expect(looksLikeTechnicalParen('Director Cut Edition')).toBe(false);
  });
});
