import { describe, expect, it } from 'vitest';
import {
  detectRepeatedHallucinations,
  filterDisplayCues,
  isHallucinatedBracketLabel,
  isNonSpeechCue,
  isSpeechCue,
  validateGeneratedSubtitles,
} from './subtitleCueUtils';
import { isValidGeneratedTrack } from './subtitleCueQuality';
import { findActiveCue } from './subtitleDebug';
import type { ParsedCue } from './vttParser';

describe('isNonSpeechCue', () => {
  it('detects YouTube-style hallucinated bracket labels', () => {
    expect(isHallucinatedBracketLabel('[welonz chuckles]')).toBe(true);
    expect(isNonSpeechCue('[welonz chuckles]')).toBe(true);
    expect(filterDisplayCues([{ start: 0, end: 1, text: '[welonz chuckles]' }], false)).toEqual([]);
  });

  it('detects music and sound labels', () => {
    expect(isNonSpeechCue('[MUSIC]')).toBe(true);
    expect(isNonSpeechCue('[Music]')).toBe(true);
    expect(isNonSpeechCue('(music)')).toBe(true);
    expect(isNonSpeechCue('♪')).toBe(true);
    expect(isNonSpeechCue('[музыка]')).toBe(true);
    expect(isNonSpeechCue('[moaning]')).toBe(true);
    expect(isNonSpeechCue('[стон]')).toBe(true);
    expect(isNonSpeechCue('Привет, как дела?')).toBe(false);
    expect(isNonSpeechCue('Hello there')).toBe(false);
  });

  it('exposes isSpeechCue as inverse', () => {
    expect(isSpeechCue('Hello there')).toBe(true);
    expect(isSpeechCue('[MUSIC]')).toBe(false);
  });
});

describe('filterDisplayCues', () => {
  it('hides non-speech cues by default', () => {
    const cues: ParsedCue[] = [
      { start: 0, end: 1, text: '[MUSIC]' },
      { start: 1, end: 2, text: 'Hello' },
    ];
    expect(filterDisplayCues(cues, false)).toEqual([
      { start: 1, end: 2, text: 'Hello' },
    ]);
  });

  it('keeps non-speech cues when sound labels are enabled', () => {
    const cues: ParsedCue[] = [
      { start: 0, end: 1, text: '[MUSIC]' },
      { start: 1, end: 2, text: 'Hello' },
    ];
    expect(filterDisplayCues(cues, true)).toEqual(cues);
  });
});

describe('validateGeneratedSubtitles', () => {
  it('marks music-only files invalid', () => {
    const result = validateGeneratedSubtitles([
      { start: 0, end: 1, text: '[MUSIC]' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/generated_no_speech|hallucinated_sound_labels/);
  });

  it('rejects mostly hallucinated bracket labels', () => {
    const cues = Array.from({ length: 6 }, (_, i) => ({
      start: i,
      end: i + 1,
      text: '[welonz chuckles]',
    }));
    const result = validateGeneratedSubtitles(cues);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hallucinated_sound_labels');
  });

  it('accepts mixed music and speech cues', () => {
    const result = validateGeneratedSubtitles([
      { start: 0, end: 1, text: '[MUSIC]' },
      { start: 1, end: 2, text: 'Hello' },
      { start: 2, end: 3, text: '[MUSIC]' },
      { start: 3, end: 4, text: 'Good morning' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.speechCueCount).toBe(2);
  });

  it('marks empty cue lists invalid', () => {
    const result = validateGeneratedSubtitles([]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('generated_no_speech');
  });
});

describe('findActiveCue with non-speech filtering', () => {
  it('does not throw when hiding non-speech cues', () => {
    const cues: ParsedCue[] = [
      { start: 0, end: 5, text: '[MUSIC]' },
      { start: 5, end: 10, text: 'Hello' },
    ];
    expect(() => findActiveCue(cues, 6, { hideNonSpeech: true })).not.toThrow();
    expect(findActiveCue(cues, 6, { hideNonSpeech: true })?.text).toBe('Hello');
    expect(findActiveCue(cues, 2, { hideNonSpeech: true })).toBeNull();
  });
});

describe('detectRepeatedHallucinations', () => {
  it('flags repeated hallucinated phrase', () => {
    const cues: ParsedCue[] = Array.from({ length: 9 }, (_, i) => ({
      start: i * 2,
      end: i * 2 + 1.5,
      text: "Oh, I'm going to sleep.",
    }));
    const stats = detectRepeatedHallucinations(cues);
    expect(stats.invalid).toBe(true);
    expect(stats.repeatCount).toBeGreaterThanOrEqual(8);
  });
});

describe('validateGeneratedSubtitles repeated text', () => {
  it('rejects repeated hallucinated generated cues', () => {
    const cues: ParsedCue[] = Array.from({ length: 9 }, (_, i) => ({
      start: i * 2,
      end: i * 2 + 1.5,
      text: "Oh, I'm going to sleep.",
    }));
    const result = validateGeneratedSubtitles(cues);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('repeated_hallucinated_text');
  });

  it('rejects cues containing raw VTT timestamps', () => {
    const result = validateGeneratedSubtitles([
      {
        start: 0,
        end: 10,
        text: `00:23:09.000 --> 00:23:11.000\nHello`,
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('generated_raw_vtt_in_cues');
  });
});

describe('validateGeneratedSubtitles coverage', () => {
  it('rejects a single cue for a long episode', () => {
    const result = validateGeneratedSubtitles(
      [{ start: 1, end: 3, text: 'Where are you?' }],
      { videoDuration: 1421, rawLength: 54 }
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('too-few-cues');
    expect(result.coverageStats?.coverageRatio).toBeLessThan(0.05);
  });
});

describe('isValidGeneratedTrack', () => {
  it('rejects invalid generated tracks', () => {
    expect(isValidGeneratedTrack({ source: 'generated', generationValid: false })).toBe(false);
    expect(isValidGeneratedTrack({ source: 'generated', generationValid: true })).toBe(true);
    expect(isValidGeneratedTrack({ source: 'external' })).toBe(true);
  });
});
