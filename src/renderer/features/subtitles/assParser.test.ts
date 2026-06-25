import { describe, expect, it } from 'vitest';
import { assTimeToSeconds, parseAssToCues } from './assParser';

describe('assTimeToSeconds', () => {
  it('parses 0:01:17.00 as 77 seconds', () => {
    expect(assTimeToSeconds('0:01:17.00')).toBeCloseTo(77);
  });

  it('parses 0:01:23.45 correctly', () => {
    expect(assTimeToSeconds('0:01:23.45')).toBeCloseTo(83.45);
  });
});

describe('parseAssToCues', () => {
  it('parses dialogue with commas in text', () => {
    const ass = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:17.00,0:01:19.00,Default,,0,0,0,,Привет, это тест`;
    const cues = parseAssToCues(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBeCloseTo(77);
    expect(cues[0].end).toBeCloseTo(79);
    expect(cues[0].text).toBe('Привет, это тест');
  });

  it('strips ASS override tags', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Line one\\NLine two`;
    const cues = parseAssToCues(ass);
    expect(cues[0].text).toBe('Line one\nLine two');
  });
});
