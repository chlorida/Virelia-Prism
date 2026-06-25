export function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[:\u2013\u2014\-_./,()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  return normalizeSearchText(query).split(' ').filter(Boolean);
}

export function matchesSearchTokens(haystack: string, query: string): boolean {
  const normalizedHaystack = normalizeSearchText(haystack);
  if (!query) return true;
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => normalizedHaystack.includes(token));
}
