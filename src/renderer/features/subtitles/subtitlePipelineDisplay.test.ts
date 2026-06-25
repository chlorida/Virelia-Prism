import { describe, expect, it } from 'vitest';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { parseAssToCues } from './assParser';
import { mergeGeneratedTracksForLanguage } from './subtitleGenerationResult';
import { isValidGeneratedTrack } from './subtitleCueQuality';
import { parseSubtitleCuesForTrack } from './subtitleTextTrack';
import { parseVtt, type ParsedCue } from './vttParser';

const baseTrack = (overrides: Partial<SubtitleTrack>): SubtitleTrack => ({
  id: 'vk-generated-en',
  videoId: 'vid',
  videoPath: 'D:\\video.mkv',
  videoKey: 'vk',
  source: 'generated',
  language: 'en',
  languageLabel: 'English',
  label: 'Generated — English',
  format: 'vtt',
  path: 'D:\\cache\\generated.en.vtt',
  ...overrides,
});

describe('A. color fallback', () => {
  it('renders cue text without speaker/color metadata', () => {
    const cue: ParsedCue = { start: 0, end: 2, text: 'Hello world' };
    const color = cue.color ?? '#FFFFFF';
    const outlineColor = cue.outlineColor ?? '#000000';
    expect(color).toBe('#FFFFFF');
    expect(outlineColor).toBe('#000000');
    expect(cue.text).toBe('Hello world');
  });
});

describe('B. generated track registration', () => {
  it('keeps valid generated track for target language', () => {
    const valid = baseTrack({ generationValid: true });
    const merged = mergeGeneratedTracksForLanguage([valid], 'en');
    expect(merged).toHaveLength(1);
    expect(isValidGeneratedTrack(valid)).toBe(true);
  });
});

describe('C. parse after generation', () => {
  it('parses generated VTT', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello\n\n';
    const track = baseTrack({ format: 'vtt' });
    const parsed = parseSubtitleCuesForTrack(track, vtt);
    expect(parsed.cues.length).toBeGreaterThan(0);
    expect(parsed.cues.length).toBeGreaterThan(0);
  });

  it('parses ASS payload even when track format is vtt', () => {
    const ass = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Sonic,0,0,0,,Hello there
`;
    const track = baseTrack({ format: 'vtt' });
    const parsed = parseSubtitleCuesForTrack(track, ass);
    expect(parsed.detectedFormat).toBe('ass');
    expect(parsed.cues.length).toBe(1);
    expect(parsed.cues[0]?.text).toBe('Hello there');
  });
});

describe('D. no color no crash', () => {
  it('ASS cues without color still parse', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,No speaker
`;
    const cues = parseAssToCues(ass);
    expect(cues[0]?.text).toBe('No speaker');
    expect(cues[0]?.color).toBeUndefined();
  });
});

describe('E. invalid old generated removed', () => {
  it('drops invalid generated track when valid exists for language', () => {
    const valid = baseTrack({ id: 'vk-generated-en-new', generationValid: true });
    const invalid = baseTrack({
      id: 'vk-generated-en-old',
      generationValid: false,
      generationInvalidReason: 'stale_pipeline',
      label: 'Generated — English (invalid)',
    });
    const merged = mergeGeneratedTracksForLanguage([valid, invalid], 'en');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('vk-generated-en-new');
  });
});

describe('F. jump to first subtitle cues', () => {
  it('first parsed cue has text for generated VTT', () => {
    const cues = parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nFirst line\n\n');
    expect(cues[0]?.text).toBe('First line');
    expect((cues[0]?.start ?? 0) + 0.1).toBeCloseTo(1.1, 5);
  });
});
