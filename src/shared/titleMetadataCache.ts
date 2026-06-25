/** Stable cache key from grouped library title identity. */
export function computeTitleMetadataCacheKey(title: {
  canonicalTitle: string;
  year?: number;
  mediaType: string;
}): string {
  const slug = title.canonicalTitle
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${slug || 'title'}-${title.year ?? 'na'}-${title.mediaType}`;
}

export const METADATA_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const METADATA_MIN_CONFIDENCE = 0.72;

export function isMetadataFailureCooldownActive(failedAt?: number, now = Date.now()): boolean {
  if (!failedAt) return false;
  return now - failedAt < METADATA_FAILURE_COOLDOWN_MS;
}

/** Strip basic HTML from provider descriptions. */
export function sanitizeMetadataDescription(raw?: string, maxLength = 480): string | undefined {
  if (!raw?.trim()) return undefined;
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}
