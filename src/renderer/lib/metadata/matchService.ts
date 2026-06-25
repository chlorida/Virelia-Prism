import type { LibraryTitle } from '../mediaIntelligence/types';
import { matchCatalogTitleToLibrary } from '../mediaIntelligence/franchise/franchiseMatcher';
import type { FranchiseCatalogTitle } from '../mediaIntelligence/franchise/franchiseCatalog';
import type { MatchConfidence, MatchSource, TitleMatchRecord } from './types';

const matchStore = new Map<string, TitleMatchRecord>();

export function getTitleMatchRecord(localTitleId: string): TitleMatchRecord {
  return matchStore.get(localTitleId) ?? {
    localTitleId,
    matchConfidence: 'none',
    matchSource: 'auto',
    rejectedCatalogIds: [],
  };
}

export function setTitleMatchRecord(record: TitleMatchRecord): void {
  matchStore.set(record.localTitleId, record);
}

export function rejectCatalogMatch(localTitleId: string, catalogId: string): void {
  const current = getTitleMatchRecord(localTitleId);
  setTitleMatchRecord({
    ...current,
    catalogId: current.catalogId === catalogId ? undefined : current.catalogId,
    matchConfidence: current.catalogId === catalogId ? 'rejected' : current.matchConfidence,
    rejectedCatalogIds: [...new Set([...current.rejectedCatalogIds, catalogId])],
    lastMatchedAt: new Date().toISOString(),
  });
}

export function confirmCatalogMatch(
  localTitleId: string,
  catalogId: string,
  source: MatchSource = 'manual'
): void {
  setTitleMatchRecord({
    localTitleId,
    catalogId,
    matchConfidence: 'confirmed',
    matchSource: source,
    rejectedCatalogIds: getTitleMatchRecord(localTitleId).rejectedCatalogIds,
    lastMatchedAt: new Date().toISOString(),
  });
}

export function autoMatchCatalogTitle(
  catalogTitle: FranchiseCatalogTitle,
  libraryTitles: LibraryTitle[]
): { localTitleId?: string; confidence: MatchConfidence } {
  const match = matchCatalogTitleToLibrary(catalogTitle, libraryTitles);
  if (!match.localTitle) {
    const numeric = match.confidence ?? 0;
    return { confidence: numeric >= 0.45 ? 'possible' : 'none' };
  }
  const record = getTitleMatchRecord(match.localTitle.id);
  if (record.rejectedCatalogIds.includes(catalogTitle.catalogTitleId)) {
    return { confidence: 'rejected' };
  }
  const numeric = match.confidence ?? 0;
  const confidence: MatchConfidence = numeric >= 0.9
    ? 'confirmed'
    : numeric >= 0.72
      ? 'likely'
      : 'possible';
  if (confidence !== 'possible') {
    confirmCatalogMatch(match.localTitle.id, catalogTitle.catalogTitleId, 'auto');
  }
  return { localTitleId: match.localTitle.id, confidence };
}
