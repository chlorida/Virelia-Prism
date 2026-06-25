import { describe, expect, it } from 'vitest';
import { buildCoverageRanges, calculateSubtitleCoverage, mergeSubtitleCoverageRanges } from './subtitleCoverage';

describe('subtitleCoverage', () => {
  it('merges overlapping cue ranges', () => {
    const ranges = mergeSubtitleCoverageRanges([
      { start: 0, end: 45 },
      { start: 40, end: 90 },
      { start: 200, end: 245 },
    ]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].end).toBe(90);
    expect(ranges[1].start).toBe(200);
  });

  it('calculates non-zero coverage when cues have timestamps', () => {
    const stats = calculateSubtitleCoverage(
      [
        { start: 0, end: 12 },
        { start: 14, end: 28 },
      ],
      1421
    );
    expect(stats.validCueCount).toBe(2);
    expect(stats.coverageRatio).toBeGreaterThan(0);
    expect(stats.generatedUntilSeconds).toBeGreaterThan(0);
  });

  it('does not invent ready ranges from generatedUntil without cue ranges', () => {
    const ranges = buildCoverageRanges(600, {
      generatedUntilSeconds: 120,
      durationSeconds: 600,
    });
    expect(ranges.filter((range) => range.status === 'ready')).toHaveLength(0);
  });
});
