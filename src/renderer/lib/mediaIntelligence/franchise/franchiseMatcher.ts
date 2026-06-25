import { getCachedParsedIdentity } from '../mediaIdentityCache';
import type { LibraryTitle } from '../types';
import type {
  FranchiseCatalogEntry,
  FranchiseCatalogMatchRule,
  FranchiseCatalogTitle,
} from './franchiseCatalog';
import { FRANCHISE_CATALOG } from './franchiseCatalog';

const ARC_TOKENS = ['gou', 'sotsu', 'kai', 'kaku', 'rei', 'reyou', 'matsuri', 'outbreak', 'boom', 'x'] as const;
const MATCH_MIN_CONFIDENCE = 0.72;
const MATCH_POSSIBLE_CONFIDENCE = 0.55;

export type FranchiseLibraryStatus = 'in_library' | 'possible_match' | 'not_in_library';

export function resolveFranchiseLibraryStatus(confidence: number): FranchiseLibraryStatus {
  if (confidence >= MATCH_MIN_CONFIDENCE) return 'in_library';
  if (confidence >= MATCH_POSSIBLE_CONFIDENCE) return 'possible_match';
  return 'not_in_library';
}

export function normalizeFranchiseText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function arcTokensIn(norm: string): Set<string> {
  const found = new Set<string>();
  for (const token of ARC_TOKENS) {
    if (norm.includes(token)) found.add(token);
  }
  return found;
}

function localTitleNames(local: LibraryTitle): string[] {
  const names = new Set<string>();
  for (const name of [local.canonicalTitle, local.displayTitle, local.localizedTitle]) {
    if (name?.trim()) names.add(name.trim());
  }
  for (const item of local.items) {
    if (item.fileName) names.add(item.fileName);
    if (item.title) names.add(item.title);
    const parsed = getCachedParsedIdentity(item);
    for (const value of [
      parsed.cleanTitle,
      parsed.canonicalTitle,
      parsed.probableSeriesTitle,
      parsed.localizedTitle,
    ]) {
      if (value?.trim()) names.add(value.trim());
    }
  }
  return [...names];
}

function localNormalizedHaystack(local: LibraryTitle): string {
  return normalizeFranchiseText(localTitleNames(local).join(' '));
}

function ruleMatches(local: LibraryTitle, localNorm: string, rule: FranchiseCatalogMatchRule): boolean {
  if (rule.year != null && local.year != null && rule.year !== local.year) return false;

  const localArc = arcTokensIn(localNorm);
  if (rule.arcTokens?.length) {
    if (!rule.arcTokens.every((token) => localArc.has(token))) return false;
  }
  if (rule.excludeArcTokens?.length) {
    if (rule.excludeArcTokens.some((token) => localArc.has(token))) return false;
  }
  if (rule.normalizedEquals?.length) {
    if (!rule.normalizedEquals.some((value) => localNorm === normalizeFranchiseText(value))) return false;
  }
  if (rule.normalizedIncludes?.length) {
    if (!rule.normalizedIncludes.every((value) => localNorm.includes(normalizeFranchiseText(value)))) {
      return false;
    }
  }
  return true;
}

function catalogTitleNames(catalog: FranchiseCatalogTitle): string[] {
  return [catalog.displayTitle, ...catalog.aliases];
}

export function scoreCatalogToLibrary(
  catalog: FranchiseCatalogTitle,
  local: LibraryTitle
): number {
  const localNorm = localNormalizedHaystack(local);
  if (!localNorm) return 0;

  let best = 0;
  for (const rule of catalog.localMatchRules) {
    if (!ruleMatches(local, localNorm, rule)) continue;
    best = Math.max(best, 0.82);
  }

  for (const name of catalogTitleNames(catalog)) {
    const remoteNorm = normalizeFranchiseText(name);
    if (!remoteNorm) continue;
    if (localNorm === remoteNorm) best = Math.max(best, 0.95);
    else if (localNorm.includes(remoteNorm) || remoteNorm.includes(localNorm)) {
      best = Math.max(best, 0.84);
    }

    const remoteTokens = remoteNorm.split(' ').filter((token) => token.length > 2);
    const localTokens = localNorm.split(' ').filter((token) => token.length > 2);
    let shared = 0;
    for (const token of remoteTokens) {
      if (localTokens.includes(token)) shared += 1;
    }
    if (shared > 0) {
      const overlap = shared / Math.max(remoteTokens.length, localTokens.length, 1);
      best = Math.max(best, 0.58 + overlap * 0.34);
    }
  }

  const localArc = arcTokensIn(localNorm);
  const catalogArc = new Set<string>();
  for (const name of catalogTitleNames(catalog)) {
    for (const token of arcTokensIn(normalizeFranchiseText(name))) catalogArc.add(token);
  }
  for (const rule of catalog.localMatchRules) {
    for (const token of rule.arcTokens ?? []) catalogArc.add(token);
  }

  if (catalogArc.size > 0) {
    let overlap = 0;
    for (const token of catalogArc) {
      if (localArc.has(token)) overlap += 1;
    }
    if (overlap === 0) best -= 0.45;
    else if (overlap === catalogArc.size) best += 0.12;
  } else if (localArc.size > 0) {
    best -= 0.2;
  }

  if (catalog.type === 'movie' && local.mediaType === 'movie') best += 0.05;
  if (catalog.type === 'series' && local.mediaType === 'series') best += 0.05;
  if ((catalog.type === 'ova' || catalog.type === 'special')
    && (local.mediaType === 'ova' || local.mediaType === 'special' || local.mediaType === 'movie')) {
    best += 0.04;
  }

  return Math.max(0, Math.min(1, best));
}

export function matchCatalogTitleToLibrary(
  catalog: FranchiseCatalogTitle,
  libraryTitles: LibraryTitle[]
): { localTitle?: LibraryTitle; confidence: number } {
  let best: { localTitle: LibraryTitle; confidence: number } | undefined;
  for (const local of libraryTitles) {
    const confidence = scoreCatalogToLibrary(catalog, local);
    if (!best || confidence > best.confidence) {
      best = { localTitle: local, confidence };
    }
  }
  if (!best || best.confidence < MATCH_MIN_CONFIDENCE) {
    return { confidence: best?.confidence ?? 0 };
  }
  return best;
}

export function matchLibraryTitleToCatalog(
  local: LibraryTitle,
  franchise?: FranchiseCatalogEntry
): { catalogTitle?: FranchiseCatalogTitle; confidence: number } {
  const entries = franchise ? [franchise] : FRANCHISE_CATALOG;
  let best: { catalogTitle: FranchiseCatalogTitle; confidence: number } | undefined;

  for (const entry of entries) {
    for (const catalogTitle of entry.titles) {
      const confidence = scoreCatalogToLibrary(catalogTitle, local);
      if (!best || confidence > best.confidence) {
        best = { catalogTitle, confidence };
      }
    }
  }

  if (!best || best.confidence < MATCH_MIN_CONFIDENCE) {
    return { confidence: best?.confidence ?? 0 };
  }
  return best;
}

export function resolveFranchiseForLibraryTitle(local: LibraryTitle): FranchiseCatalogEntry | undefined {
  if (local.franchiseId) {
    const byId = FRANCHISE_CATALOG.find((entry) => entry.franchiseId === local.franchiseId);
    if (byId) return byId;
  }

  const localNorm = localNormalizedHaystack(local);
  return FRANCHISE_CATALOG.find((entry) => {
    const franchiseNorm = normalizeFranchiseText(entry.franchiseName);
    return localNorm.includes(franchiseNorm) || franchiseNorm.split(' ').every((token) => localNorm.includes(token));
  });
}

export function isNonVideoRemoteFormat(format?: string): boolean {
  if (!format) return false;
  const upper = format.toUpperCase();
  return upper === 'MANGA'
    || upper === 'NOVEL'
    || upper === 'LIGHT_NOVEL'
    || upper === 'ONE_SHOT';
}
