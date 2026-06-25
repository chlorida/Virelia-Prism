import type { SubtitleCoverageRange, SubtitleGenerationProgressDetail } from '../../../shared/subtitleTypes';

export interface SubtitleCueTiming {
  start: number;
  end: number;
}

export interface SubtitleCoverageStats {
  generatedCueCount: number;
  validCueCount: number;
  generatedUntilSeconds: number;
  coverageRatio: number;
  coverageRanges: SubtitleCoverageRange[];
  contiguousFromStart: boolean;
  rangeCount: number;
}

const MIN_CUE_SECONDS = 0.05;

function isValidCueTiming(cue: SubtitleCueTiming): boolean {
  return Number.isFinite(cue.start)
    && Number.isFinite(cue.end)
    && cue.end > cue.start + MIN_CUE_SECONDS;
}

/** Merge overlapping/adjacent cue intervals into coverage ranges. */
export function mergeSubtitleCoverageRanges(
  cues: SubtitleCueTiming[],
  status: SubtitleCoverageRange['status'] = 'ready'
): SubtitleCoverageRange[] {
  const intervals = cues
    .filter(isValidCueTiming)
    .map((cue) => ({ start: Math.max(0, cue.start), end: cue.end }))
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0) return [];

  const merged: SubtitleCoverageRange[] = [];
  let current = { ...intervals[0] };

  for (let i = 1; i < intervals.length; i += 1) {
    const next = intervals[i];
    if (next.start <= current.end + 0.25) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push({ start: current.start, end: current.end, status });
      current = { ...next };
    }
  }
  merged.push({ start: current.start, end: current.end, status });

  return merged;
}

export function calculateSubtitleCoverage(
  cues: SubtitleCueTiming[],
  durationSeconds?: number
): SubtitleCoverageStats {
  const validCues = cues.filter(isValidCueTiming);
  const readyRanges = mergeSubtitleCoverageRanges(validCues, 'ready');
  const coveredSeconds = readyRanges.reduce((sum, range) => sum + (range.end - range.start), 0);
  const generatedUntilSeconds = readyRanges.length > 0
    ? readyRanges[readyRanges.length - 1].end
    : validCues.reduce((max, cue) => Math.max(max, cue.end), 0);
  const contiguousFromStart = readyRanges.length > 0
    && readyRanges[0].start <= 0.05
    && readyRanges.length === 1;
  const coverageRatio = durationSeconds && durationSeconds > 0
    ? Math.min(1, coveredSeconds / durationSeconds)
    : 0;

  return {
    generatedCueCount: cues.length,
    validCueCount: validCues.length,
    generatedUntilSeconds,
    coverageRatio,
    coverageRanges: readyRanges,
    contiguousFromStart,
    rangeCount: readyRanges.length,
  };
}

export function buildCoverageRanges(
  durationSeconds: number | undefined,
  detail: SubtitleGenerationProgressDetail | null | undefined
): SubtitleCoverageRange[] {
  if (!durationSeconds || durationSeconds <= 0 || !detail) return [];

  if (detail.coverageRanges && detail.coverageRanges.length > 0) {
    const ranges = detail.coverageRanges.map((range) => ({
      ...range,
      start: Math.max(0, range.start),
      end: Math.min(range.end, durationSeconds),
    })).filter((range) => range.end > range.start);

    if (
      detail.currentSegmentStart != null
      && detail.currentSegmentEnd != null
      && detail.currentSegmentEnd > detail.currentSegmentStart
    ) {
      const generating: SubtitleCoverageRange = {
        start: detail.currentSegmentStart,
        end: Math.min(detail.currentSegmentEnd, durationSeconds),
        status: 'generating',
      };
      if (generating.end > generating.start) {
        ranges.push(generating);
      }
    }
    return ranges;
  }

  const ranges: SubtitleCoverageRange[] = [];
  if (
    detail.currentSegmentStart != null
    && detail.currentSegmentEnd != null
    && detail.currentSegmentEnd > detail.currentSegmentStart
  ) {
    ranges.push({
      start: detail.currentSegmentStart,
      end: Math.min(detail.currentSegmentEnd, durationSeconds),
      status: 'generating',
    });
  }
  return ranges;
}

export function formatCoverageSummary(
  detail: SubtitleGenerationProgressDetail | null | undefined,
  formatDuration: (seconds: number) => string
): string | undefined {
  if (!detail?.durationSeconds || detail.durationSeconds <= 0) return undefined;

  const duration = detail.durationSeconds;
  const ratio = detail.coverageRatio ?? 0;
  const pct = Math.round(ratio * 100);
  const until = detail.generatedUntilSeconds ?? 0;

  if (detail.rangeCount != null && detail.rangeCount > 1 && !detail.contiguousFromStart) {
    return `${formatDuration(until)} covered · ${pct}% in ${detail.rangeCount} ranges`;
  }

  if (until > 0) {
    return `${formatDuration(0)}–${formatDuration(until)} / ${formatDuration(duration)} (${pct}%)`;
  }

  if (pct > 0) {
    return `${pct}% of ${formatDuration(duration)}`;
  }

  return `${formatDuration(0)}–${formatDuration(0)} / ${formatDuration(duration)} (0%)`;
}

export function formatCoverageLabel(
  generatedUntil: number | undefined,
  durationSeconds: number | undefined,
  formatDuration: (seconds: number) => string,
  detail?: SubtitleGenerationProgressDetail | null
): string | undefined {
  if (detail) {
    return formatCoverageSummary(detail, formatDuration);
  }
  if (!durationSeconds || durationSeconds <= 0) return undefined;
  const until = generatedUntil ?? 0;
  const pct = Math.round((until / durationSeconds) * 100);
  return `${formatDuration(0)}–${formatDuration(until)} / ${formatDuration(durationSeconds)} (${pct}%)`;
}

export function mergeGenerationDetail(
  prev: SubtitleGenerationProgressDetail | null | undefined,
  next: Partial<SubtitleGenerationProgressDetail>
): SubtitleGenerationProgressDetail {
  const merged = { ...(prev ?? {}) } as SubtitleGenerationProgressDetail;
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  merged.updatedAt = Date.now();
  return merged;
}
