import { describe, expect, it } from 'vitest';
import { convertAssToVtt, convertSrtToVtt } from './srtToVtt';

describe('convertSrtToVtt', () => {
  it('converts basic SRT cues to WebVTT', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Hello world

2
00:00:04,000 --> 00:00:06,500
Second line`;
    const vtt = convertSrtToVtt(srt);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:01.000 --> 00:00:03.000');
    expect(vtt).toContain('Hello world');
    expect(vtt).toContain('Second line');
  });
});

describe('convertAssToVtt', () => {
  it('extracts dialogue lines from ASS', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Привет`;
    const vtt = convertAssToVtt(ass);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('Привет');
  });

  it('keeps commas inside dialogue text', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello, world`;
    const vtt = convertAssToVtt(ass);
    expect(vtt).toContain('Hello, world');
  });
});
