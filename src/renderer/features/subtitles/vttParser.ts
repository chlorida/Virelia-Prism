export interface ParsedCue {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  color?: string;
  outlineColor?: string;
}

const CUE_TIMESTAMP_RE =
  /^((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3})/;

function isTimestampLine(line: string): boolean {
  return CUE_TIMESTAMP_RE.test(line.trim());
}

function parseTimestampLine(line: string): { start: number; end: number } | null {
  const match = line.trim().match(CUE_TIMESTAMP_RE);
  if (!match) return null;
  const start = vttTimeToSeconds(match[1]);
  const end = vttTimeToSeconds(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/** Parse WebVTT text into timed cues for manual overlay rendering. */
export function parseVtt(vtt: string): ParsedCue[] {
  const normalized = vtt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const cues: ParsedCue[] = [];

  let i = 0;
  while (i < lines.length && !lines[i].trim().startsWith('WEBVTT')) {
    i += 1;
  }
  if (i < lines.length) i += 1;

  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i += 1;
    if (i >= lines.length) break;

    const line = lines[i].trim();
    if (!isTimestampLine(line)) {
      i += 1;
      continue;
    }

    const times = parseTimestampLine(line);
    if (!times) {
      i += 1;
      continue;
    }
    i += 1;

    const textLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i];
      const trimmed = current.trim();
      if (isTimestampLine(trimmed)) break;
      if (!trimmed) {
        const nextTrimmed = lines[i + 1]?.trim() ?? '';
        if (isTimestampLine(nextTrimmed)) break;
        if (textLines.length > 0) break;
        i += 1;
        continue;
      }
      textLines.push(current.trimEnd());
      i += 1;
    }

    const text = textLines.join('\n').trim();
    if (text) {
      cues.push({ start: times.start, end: times.end, text });
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function vttTimeToSeconds(raw: string): number {
  const t = raw.trim().replace(',', '.');
  const parts = t.split(':').map((p) => p.trim());
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return Number(m) * 60 + Number(s);
  }
  return Number(t);
}
