import type { MediaItem } from '../../../../shared/types';

import type { ParsedMediaIdentity } from '../types';

import { applyLocalizedToIdentity, resolveLanguage } from '../localizedMetadataService';
import type { MediaDisplayLanguage } from '../languageResolution';

import { parseMediaIdentity } from '../episodeParser';

import type { MediaMetadata, MetadataProvider, MetadataSearchQuery } from './types';



const cache = new Map<string, MediaMetadata>();

const providers: MetadataProvider[] = [];

const inflight = new Set<string>();



/** Register online/local metadata providers (disabled until configured). */

export function registerMetadataProvider(provider: MetadataProvider): void {

  if (!providers.some((p) => p.id === provider.id)) providers.push(provider);

}



export function getCachedMetadata(mediaId: string): MediaMetadata | undefined {

  return cache.get(mediaId);

}



export function setCachedMetadata(mediaId: string, metadata: MediaMetadata): void {

  cache.set(mediaId, metadata);

}



function cacheKey(item: MediaItem, language: string): string {

  const identity = parseMediaIdentity(item.title, item.fileName);

  const title = identity.probableSeriesTitle ?? identity.cleanTitle;

  return `${title}|${identity.year ?? ''}|${item.kind}|${language}`;

}



/** Apply cached or stored localized title onto parsed identity. */

export function enrichIdentityWithMetadata(

  item: MediaItem,

  identity: ParsedMediaIdentity,

  language?: MediaDisplayLanguage

): ParsedMediaIdentity {

  return applyLocalizedToIdentity(item, identity, language);

}



/** Background lookup — no-op when online providers disabled; never blocks UI. */

export async function lookupMetadata(

  item: MediaItem,

  options?: { language?: string; enableOnline?: boolean }

): Promise<MediaMetadata | null> {

  const cached = cache.get(item.id);

  if (cached) return cached;

  if (!options?.enableOnline || providers.length === 0) return null;



  const lang = resolveLanguage(options.language as MediaDisplayLanguage | undefined);

  const key = cacheKey(item, lang);

  if (inflight.has(key)) return null;

  inflight.add(key);



  const identity = parseMediaIdentity(item.title, item.fileName);

  const query: MetadataSearchQuery = {

    title: identity.probableSeriesTitle ?? identity.cleanTitle,

    kind: item.kind === 'video' ? 'series' : 'unknown',

    year: identity.year,

    season: identity.seasonNumber,

    episode: identity.episodeNumber,

    language: lang,

  };



  try {

    for (const provider of providers) {

      try {

        const results = await provider.search(query);

        const best = results[0];

        if (!best) continue;

        const details = await provider.getDetails(best.providerMediaId, query.language ?? 'en');

        if (details && 'kind' in details) {

          cache.set(item.id, details);

          return details;

        }

      } catch {

        // offline / rate limit — fall back to parser

      }

    }

  } finally {

    inflight.delete(key);

  }

  return null;

}


