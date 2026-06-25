import { describe, expect, it } from 'vitest';
import {
  looksLikeRawSubtitleFile,
  sanitizeCueTextForDisplay,
} from './subtitleSanitize';

describe('looksLikeRawSubtitleFile', () => {
  it('detects raw VTT blocks', () => {
    const raw = `WEBVTT

00:23:09.000 --> 00:23:11.000
Hello
00:23:11.000 --> 00:23:13.000
Hello`;
    expect(looksLikeRawSubtitleFile(raw)).toBe(true);
  });

  it('does not flag normal subtitle line', () => {
    expect(looksLikeRawSubtitleFile("Oh, I'm going to sleep.")).toBe(false);
  });
});

describe('sanitizeCueTextForDisplay', () => {
  it('returns empty for raw VTT text', () => {
    const raw = `00:23:09.000 --> 00:23:11.000
Hello`;
    expect(sanitizeCueTextForDisplay(raw)).toBe('');
  });

  it('returns normal cue text unchanged', () => {
    expect(sanitizeCueTextForDisplay('Привет!')).toBe('Привет!');
  });
});
