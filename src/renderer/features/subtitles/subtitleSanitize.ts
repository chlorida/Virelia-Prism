const TIMESTAMP_ARROW_RE = /-->/;
const TIMESTAMP_LINE_RE = /\d{1,2}:\d{2}:\d{2}[.,]\d{3}/;
const WEBVTT_HEADER_RE = /^WEBVTT\b/i;

export function looksLikeRawSubtitleFile(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (WEBVTT_HEADER_RE.test(trimmed)) return true;

  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;

  let timestampLines = 0;
  for (const line of lines) {
    if (line.includes('-->') && TIMESTAMP_LINE_RE.test(line)) {
      timestampLines += 1;
    }
  }

  if (timestampLines >= 2) return true;
  if (timestampLines >= 1 && lines.length >= 3) {
    const arrowInText = trimmed.includes('-->');
    const multiTimestamp = (trimmed.match(/\d{1,2}:\d{2}:\d{2}[.,]\d{3}/g) ?? []).length >= 2;
    if (arrowInText && multiTimestamp) return true;
  }

  return false;
}

export function cueTextContainsTimestampMarkup(text: string): boolean {
  if (!text.trim()) return false;
  if (TIMESTAMP_ARROW_RE.test(text)) return true;
  if (WEBVTT_HEADER_RE.test(text.trim())) return true;
  const lines = text.split('\n').filter((l) => l.trim());
  const tsLines = lines.filter((l) => l.includes('-->') && TIMESTAMP_LINE_RE.test(l));
  return tsLines.length > 0;
}

export function sanitizeCueTextForDisplay(text: string): string {
  if (!text.trim()) return '';
  if (looksLikeRawSubtitleFile(text) || cueTextContainsTimestampMarkup(text)) {
    console.error(
      '[Virelia subtitles] raw subtitle file was passed to overlay instead of cue.text',
      text.slice(0, 500)
    );
    return '';
  }
  return text.trim();
}
