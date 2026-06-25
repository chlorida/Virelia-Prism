/** Convert SRT subtitle text to WebVTT without FFmpeg. */
export function convertSrtToVtt(srt: string): string {
  const normalized = srt.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n/);
  const cues: string[] = ['WEBVTT', ''];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [start, end] = timeLine.split('-->').map((s) => s.trim());
    const textStart = lines.indexOf(timeLine) + 1;
    const text = lines.slice(textStart).join('\n');
    if (!text) continue;
    cues.push(`${toVttTime(start)} --> ${toVttTime(end)}`);
    cues.push(text);
    cues.push('');
  }

  return cues.join('\n');
}

function toVttTime(srtTime: string): string {
  const normalized = srtTime.replace(',', '.');
  if (normalized.split(':').length === 2) {
    return `00:${normalized}`;
  }
  return normalized;
}

/** Basic ASS/SSA dialogue lines to VTT (styles stripped). */
export function convertAssToVtt(ass: string): string {
  const lines = ass.replace(/\r\n/g, '\n').split('\n');
  const cues: string[] = ['WEBVTT', ''];
  let inEvents = false;
  let formatCols: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[Events]')) {
      inEvents = true;
      continue;
    }
    if (trimmed.startsWith('[') && !trimmed.startsWith('[Events]')) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    if (trimmed.startsWith('Format:')) {
      formatCols = trimmed.slice('Format:'.length).split(',').map((c) => c.trim());
      continue;
    }
    if (!trimmed.startsWith('Dialogue:')) continue;
    const parts = splitAssFields(trimmed.slice('Dialogue:'.length), formatCols.length);
    if (formatCols.length === 0 || parts.length < formatCols.length) continue;
    const startIdx = formatCols.indexOf('Start');
    const endIdx = formatCols.indexOf('End');
    const textIdx = formatCols.indexOf('Text');
    if (startIdx < 0 || endIdx < 0 || textIdx < 0) continue;
    const start = assTimeToVtt(parts[startIdx] ?? '0');
    const end = assTimeToVtt(parts[endIdx] ?? '0');
    const text = parts.slice(textIdx).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n');
    if (!text.trim()) continue;
    cues.push(`${start} --> ${end}`);
    cues.push(text);
    cues.push('');
  }

  return cues.length > 2 ? cues.join('\n') : convertSrtToVtt('');
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

function assTimeToVtt(raw: string): string {
  const cleaned = raw.trim();
  const parts = cleaned.split(':');
  if (parts.length !== 3) return '00:00:00.000';
  const [h, m, secPart] = parts;
  const [sec, centis = '0'] = secPart.replace(',', '.').split('.');
  const ms = centis.padEnd(3, '0').slice(0, 3);
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${sec.padStart(2, '0')}.${ms}`;
}
