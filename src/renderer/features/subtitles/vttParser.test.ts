import { describe, expect, it } from 'vitest';
import { parseVtt, vttTimeToSeconds } from './vttParser';

describe('vttTimeToSeconds', () => {
  it('parses hh:mm:ss.mmm', () => {
    expect(vttTimeToSeconds('00:01:23.456')).toBeCloseTo(83.456);
  });

  it('parses mm:ss.mmm', () => {
    expect(vttTimeToSeconds('01:23.456')).toBeCloseTo(83.456);
  });
});

describe('parseVtt', () => {
  it('parses cues from WEBVTT with blank lines', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello

00:00:04.000 --> 00:00:06.000
World`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Hello');
    expect(cues[1].text).toBe('World');
  });

  it('parses whisper-style VTT with single newlines between cues', () => {
    const vtt = `WEBVTT

00:23:09.000 --> 00:23:11.000
Oh, I'm going to sleep.
00:23:11.000 --> 00:23:13.000
Oh, I'm going to sleep.`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("Oh, I'm going to sleep.");
    expect(cues[0].text).not.toContain('-->');
    expect(cues[1].text).toBe("Oh, I'm going to sleep.");
  });
});
