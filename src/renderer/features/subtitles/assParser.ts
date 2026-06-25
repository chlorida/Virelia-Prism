import type { ParsedCue } from './vttParser';

/** Parse ASS/SSA [Events] Dialogue lines into timed cues. */
export function parseAssToCues(ass: string): ParsedCue[] {
  const lines = ass.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let inEvents = false;
  let formatCols: string[] = [];
  const cues: ParsedCue[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[Events\]/i.test(trimmed)) {
      inEvents = true;
      continue;
    }
    if (/^\[[A-Za-z]+\]/i.test(trimmed) && !/^\[Events\]/i.test(trimmed)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;

    if (/^Format:/i.test(trimmed)) {
      formatCols = trimmed.slice(trimmed.indexOf(':') + 1).split(',').map((c) => c.trim());
      continue;
    }
    if (!/^Dialogue:/i.test(trimmed)) continue;

    const body = trimmed.slice(trimmed.indexOf(':') + 1);
    const parts = splitAssFields(body, formatCols.length);
    if (formatCols.length === 0 || parts.length < formatCols.length) continue;

    const startIdx = formatCols.findIndex((c) => c.toLowerCase() === 'start');
    const endIdx = formatCols.findIndex((c) => c.toLowerCase() === 'end');
    const textIdx = formatCols.findIndex((c) => c.toLowerCase() === 'text');
    const nameIdx = formatCols.findIndex((c) => c.toLowerCase() === 'name');
    if (startIdx < 0 || endIdx < 0 || textIdx < 0) continue;

    const start = assTimeToSeconds(parts[startIdx] ?? '');
    const end = assTimeToSeconds(parts[endIdx] ?? '');
    const text = stripAssTags(parts[textIdx] ?? '');
    const speaker = nameIdx >= 0 ? parts[nameIdx]?.trim() : '';
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text.trim()) continue;

    cues.push({
      start,
      end,
      text: text.trim(),
      speaker: speaker || undefined,
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function assTimeToSeconds(raw: string): number {
  const cleaned = raw.trim();
  const parts = cleaned.split(':');
  if (parts.length !== 3) return Number.NaN;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const secParts = parts[2].replace(',', '.').split('.');
  const sec = Number(secParts[0] ?? 0);
  const frac = secParts[1] ?? '0';
  const ms = Number(frac.padEnd(3, '0').slice(0, 3)) / 1000;
  return h * 3600 + m * 60 + sec + ms;
}

function splitAssFields(body: string, fieldCount: number): string[] {
  const out: string[] = [];
  let rest = body;
  for (let i = 0; i < fieldCount - 1; i++) {
    const idx = rest.indexOf(',');
    if (idx < 0) break;
    out.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx + 1);
  }
  out.push(rest.trim());
  return out;
}

function stripAssTags(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .trim();
}
