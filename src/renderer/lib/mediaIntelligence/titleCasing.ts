const LOWER_PARTICLES = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
  'no', 'ni', 'na', 'ku', 'wo', 'wa', 'ga', 'de', 'te', 'he', 'ni',
]);

/** Title-case romanized names; keep small particles lower except first word. */
export function toDisplayTitleCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  return trimmed
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && LOWER_PARTICLES.has(lower)) return lower;
      if (/^[A-Z]{2,}$/.test(word) && word.length <= 4) return word;
      if (word.includes('-')) {
        return word.split('-').map((p, pi) => formatWord(p, index === 0 && pi === 0)).join('-');
      }
      return formatWord(word, index === 0);
    })
    .join(' ');
}

function formatWord(word: string, isFirst: boolean): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (!isFirst && LOWER_PARTICLES.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
