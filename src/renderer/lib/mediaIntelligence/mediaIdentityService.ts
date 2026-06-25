import type { MediaItem } from '../../../shared/types';
import type { MediaManualOverride } from './types';
import { parseMediaIdentity, normalizeSeriesKey } from './episodeParser';
import { applyLocalizedToIdentity, buildLocalizedDisplayTitle, resolveLanguage } from './localizedMetadataService';
import { getCachedParsedIdentity } from './mediaIdentityCache';
import type { DisplayTitleSource, MediaDisplayIdentity, ParsedMediaIdentity } from './types';

const manualOverrides = new Map<string, MediaManualOverride>();

export function setManualOverride(mediaId: string, override: MediaManualOverride | undefined): void {
  if (!override) manualOverrides.delete(mediaId);
  else manualOverrides.set(mediaId, override);
}

export function getManualOverride(mediaId: string): MediaManualOverride | undefined {
  return manualOverrides.get(mediaId);
}

function uniqueChips(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 10);
}

export function getTechnicalChipsFromParsed(identity: ParsedMediaIdentity): string[] {
  const chips: string[] = [];
  if (identity.specialType) chips.push(identity.specialType);
  for (const tag of identity.versionTags ?? []) {
    chips.push(tag.toUpperCase());
  }
  if (identity.releaseGroup) chips.push(identity.releaseGroup);
  if (identity.resolution) chips.push(identity.resolution);
  if (identity.videoCodec) chips.push(identity.videoCodec);
  if (identity.audioCodec) chips.push(identity.audioCodec);
  if (identity.source) chips.push(identity.source);
  if (identity.container) chips.push(identity.container);
  for (const t of identity.technicalTags) {
    if (!chips.some((c) => c.toLowerCase() === t.toLowerCase())) chips.push(t);
  }
  return uniqueChips(chips);
}

export function buildMediaDisplayIdentity(
  item: MediaItem,
  language?: string
): MediaDisplayIdentity {
  const lang = resolveLanguage(language);
  const manual = getManualOverride(item.id);
  const parsed = manual
    ? parseMediaIdentity(item.title, item.fileName)
    : getCachedParsedIdentity(item);
  const enriched = applyLocalizedToIdentity(item, parsed, lang, manual);

  let source: DisplayTitleSource = 'parser';
  if (manual?.titles) source = 'manual';
  else if (enriched.localizedTitle && enriched.localizedTitle !== enriched.probableSeriesTitle) {
    source = enriched.localizedTitles?.en ? 'alias-cache' : 'parser';
  }

  const episodeLabel = enriched.episodeNumber != null
    ? String(enriched.episodeNumber).padStart(2, '0')
    : undefined;

  return {
    title: enriched.displayTitle,
    subtitle: enriched.probableSeriesTitle !== enriched.displayTitle ? enriched.probableSeriesTitle : undefined,
    originalTitle: enriched.originalTitle,
    localizedTitles: enriched.localizedTitles,
    episodeLabel,
    technicalChips: getTechnicalChipsFromParsed(enriched),
    confidence: enriched.confidence,
    source,
    parsed: enriched,
  };
}

export function getParsedIdentity(item: MediaItem, language?: string): ParsedMediaIdentity {
  return buildMediaDisplayIdentity(item, language).parsed;
}

export function getDisplayTitleForItem(item: MediaItem, language?: string): string {
  return buildMediaDisplayIdentity(item, language).title;
}

export { normalizeSeriesKey, parseMediaIdentity };
