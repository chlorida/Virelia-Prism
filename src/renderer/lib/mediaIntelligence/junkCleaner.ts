/** Conservative removal of download-site garbage from media titles. */

const JUNK_WORDS = new Set([
  'tuberipper',
  'click',
  'uploaded',
  'upload',
  'download',
  'free',
  'official',
  'www',
  'rip',
  'reupload',
  'background',
]);

const JUNK_PATTERNS: RegExp[] = [
  /\btuberipper\b/gi,
  /\bclick\s*here\b/gi,
  /\buploaded\b/gi,
  /\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  /\b[a-z0-9-]+\.(com|net|org|ru|io)\b/gi,
  /\[[a-f0-9]{8,}\]/gi,
  /\([a-f0-9]{8,}\)/gi,
  /\b\d{6,}\b/g,
];

function isJunkToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return true;
  if (JUNK_WORDS.has(t)) return true;
  if (/^www\./i.test(t)) return true;
  if (/^[a-f0-9]{12,}$/i.test(t)) return true;
  return false;
}

export interface JunkCleanResult {
  text: string;
  junkTags: string[];
}

/** Strip known junk from a human title segment (not full filename). */
export function cleanJunkFromTitle(input: string): JunkCleanResult {
  const junkTags: string[] = [];
  let text = input;

  for (const pattern of JUNK_PATTERNS) {
    text = text.replace(pattern, (match) => {
      junkTags.push(match.trim());
      return ' ';
    });
  }

  const parts = text.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const part of parts) {
    if (isJunkToken(part)) {
      junkTags.push(part);
      continue;
    }
    kept.push(part);
  }

  return {
    text: kept.join(' ').replace(/\s+/g, ' ').trim(),
    junkTags,
  };
}

export function looksLikeTechnicalParen(inner: string): boolean {
  const t = inner.trim();
  if (!t) return false;
  if (/\d{3,4}\s*x\s*\d{3,4}/i.test(t)) return true;
  if (/\d{3,4}p/i.test(t)) return true;
  if (/\b(bd|bdrip|bluray|web-?dl|hdtv|dvdrip)\b/i.test(t)) return true;
  if (/\bx26[45]\b/i.test(t)) return true;
  if (/\b(aac|flac|opus|dts)\b/i.test(t)) return true;
  if (/(hevc|h\.?26[45]|avc)/i.test(t)) return true;
  const techTokens = t.split(/[\s,;/]+/).filter(Boolean);
  const techish = techTokens.filter((tok) =>
    /^\d{3,4}p$/i.test(tok)
    || /^x26[45]$/i.test(tok)
    || /^\d{3,4}x\d{3,4}$/i.test(tok)
    || /^(aac|flac|bd|bdrip)$/i.test(tok)
  );
  return techish.length >= 2 || (techish.length >= 1 && techTokens.length <= 6);
}
