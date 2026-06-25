import type { LibraryTitle } from '../types';
import type {
  EnrichedTitleMetadata,
  TitleMetadataRecord,
  TitleMetadataState,
} from '../../../../shared/titleMetadataTypes';
import { TITLE_METADATA_CACHE_VERSION } from '../../../../shared/titleMetadataTypes';
import {
  computeTitleMetadataCacheKey,
  isMetadataFailureCooldownActive,
} from '../../../../shared/titleMetadataCache';
import { getPrism } from '../../prismApi';
import { listMetadataProviders } from './metadataProviderRegistry';
import { buildTitleMatchInput, cleanMovieSearchTitle, pickBestMetadataMatch, scoreMetadataCandidate } from './metadataMatcher';
import { registerDefaultMetadataProviders } from './providers/registerProviders';
import {
  cacheRemotePosterUrl,
  cacheTitleMediaBundle,
  pickPrimaryBackdropUrl,
  pickPrimaryPosterUrl,
} from './metadataMediaAssets';
import type { MediaMetadata, MetadataSearchResult } from './types';
import { fetchJikanMediaSupplement } from './jikanMediaSupplement';
import { fetchAnilistEpisodeScreenshots } from './anilistEpisodeScreenshots';
import { isAudioOnlyLibraryTitle } from '../audioAlbumService';
import type { TitleMediaAsset } from '../../../../shared/titleMetadataTypes';
import { findWorkAlias, findSeriesAlias } from '../aliasCache';
import { resolveOnlineMetadataEnabled } from '../../metadata/metadataSettings';

function primaryPosterFromDetails(details: EnrichedTitleMetadata | MediaMetadata): string | undefined {
  if ('media' in details) {
    return details.posterUrl ?? details.media?.posters?.[0]?.url;
  }
  return details.posterUrl;
}

function dedupeMediaAssets(assets: TitleMediaAsset[]): TitleMediaAsset[] {
  const seen = new Set<string>();
  const out: TitleMediaAsset[] = [];
  for (const asset of assets) {
    const key = asset.url ?? asset.originalUrl ?? asset.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

export async function attachMediaSupplement(
  details: EnrichedTitleMetadata,
  options?: { replaceScreenshots?: boolean }
): Promise<EnrichedTitleMetadata> {
  const anilistId = details.externalIds?.anilist
    ?? (details.sourceProvider === 'anilist' ? Number(details.providerMediaId) : undefined);
  const malId = details.externalIds?.mal
    ?? (details.sourceProvider === 'jikan' ? Number(details.providerMediaId) : undefined);
  const hasMalId = Boolean(malId && Number.isFinite(malId));
  const hasAnilistId = Boolean(anilistId && Number.isFinite(anilistId));
  if (!hasMalId && !hasAnilistId) return details;

  try {
    const [supplement, episodeScreenshots] = await Promise.all([
      hasMalId
        ? withTimeout(fetchJikanMediaSupplement(malId!), 18_000, 'jikan supplement')
        : Promise.resolve({ promotionalArt: [] as TitleMediaAsset[], trailer: null }),
      withTimeout(
        fetchAnilistEpisodeScreenshots({ anilistId, malId }),
        12_000,
        'anilist episode screenshots',
      ),
    ]);

    const media = details.media ?? {};
    const trailer = media.trailer?.url ? media.trailer : supplement.trailer ?? media.trailer ?? null;
    const posters = options?.replaceScreenshots
      ? (supplement.promotionalArt ?? [])
      : dedupeMediaAssets([
        ...(media.posters ?? []),
        ...(supplement.promotionalArt ?? []),
      ]);
    const screenshots = options?.replaceScreenshots
      ? episodeScreenshots
      : dedupeMediaAssets([
        ...(media.screenshots ?? []),
        ...episodeScreenshots,
      ]);

    return {
      ...details,
      trailerUrl: details.trailerUrl ?? supplement.trailer?.url,
      trailerThumbnailUrl: details.trailerThumbnailUrl ?? supplement.trailer?.thumbnailUrl,
      media: {
        ...media,
        posters: posters.length > 0 ? posters : media.posters,
        screenshots: screenshots.length > 0 ? screenshots : media.screenshots,
        trailer,
      },
    };
  } catch {
    return details;
  }
}

function asEnrichedMetadata(details: EnrichedTitleMetadata | MediaMetadata): EnrichedTitleMetadata {
  if ('canonicalTitle' in details) return details;
  return {
    canonicalTitle: details.title,
    localizedTitle: details.localizedTitle,
    originalTitle: details.originalTitle,
    description: details.overview,
    year: details.year,
    posterUrl: details.posterUrl,
    backdropUrl: details.backdropUrl,
    genres: details.genres,
    sourceProvider: details.providerId as EnrichedTitleMetadata['sourceProvider'],
    providerMediaId: details.providerMediaId,
    confidence: details.confidence,
  };
}

export type MetadataPriority = 'critical' | 'high' | 'normal' | 'low' | 'idle';

const METADATA_STALE_LOADING_MS = 45_000;
const METADATA_ENRICH_TIMEOUT_MS = 75_000;

function queueDelayMs(priority: MetadataPriority): number {
  if (priority === 'critical') return 0;
  if (priority === 'high') return 80;
  if (priority === 'normal') return 200;
  return 300;
}

function isStaleMetadataLoading(record?: TitleMetadataRecord): boolean {
  return record?.state === 'metadataLoading'
    && Date.now() - (record.updatedAt ?? 0) > METADATA_STALE_LOADING_MS;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const PRIORITY_WEIGHT: Record<MetadataPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  idle: 4,
};

const memory = new Map<string, TitleMetadataRecord>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
const queue: Array<{ title: LibraryTitle; priority: MetadataPriority }> = [];
let processing = false;
let displayLanguage = 'en';
const reconcileInflight = new Set<string>();
const extrasInflight = new Set<string>();
const refreshMarks = new Set<string>();

export type MetadataRefreshNotice = 'offline' | 'updated' | 'restored' | 'failed';

export interface MetadataRefreshResult {
  record: TitleMetadataRecord;
  notice?: MetadataRefreshNotice;
}

/** Synchronous UI signal — call before any await when the user requests refresh. */
export function markTitleMetadataRefreshStarted(title: LibraryTitle): void {
  const cacheKey = computeTitleMetadataCacheKey(title);
  refreshMarks.add(cacheKey);
  const current = memory.get(cacheKey) ?? getTitleMetadataRecord(title);
  memory.set(cacheKey, {
    ...current,
    state: 'metadataLoading',
    updatedAt: Date.now(),
  });
  notify();
}

function clearTitleMetadataRefreshMark(cacheKey: string): void {
  refreshMarks.delete(cacheKey);
}

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function subscribeTitleMetadata(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function configureTitleMetadata(options: { enableOnline?: boolean; language?: string }): void {
  if (options.language) displayLanguage = options.language;
}

function hasUsableMetadata(record?: TitleMetadataRecord): boolean {
  return Boolean(
    record?.metadata
    && (record.state === 'metadataReady' || record.state === 'metadataNeedsReview')
  );
}

function normalizePersistedRecord(record: TitleMetadataRecord): TitleMetadataRecord {
  if (record.state !== 'metadataLoading') return record;
  if (record.metadata && (record.posterDisplayUrl || record.metadata.posterUrl)) {
    return {
      ...record,
      state: record.confidence > 0 && record.confidence < 0.72
        ? 'metadataNeedsReview'
        : 'metadataReady',
    };
  }
  return { ...record, state: 'localOnly' };
}

export async function ensureTitleMetadataHydrated(title: LibraryTitle): Promise<TitleMetadataRecord> {
  const cacheKey = computeTitleMetadataCacheKey(title);
  const memoryRecord = memory.get(cacheKey);
  if (hasUsableMetadata(memoryRecord)) {
    void reconcileMediaSupplement(title, memoryRecord!).catch(() => undefined);
    return memoryRecord!;
  }

  const persisted = await loadPersistedRecord(cacheKey);
  if (persisted) {
    const normalized = normalizePersistedRecord(persisted);
    memory.set(cacheKey, normalized);
    notify();
    if (hasUsableMetadata(normalized)) {
      void reconcileMediaSupplement(title, normalized).catch(() => undefined);
    }
    return normalized;
  }

  return getTitleMetadataRecord(title);
}

export function getTitleMetadataRecord(title: LibraryTitle): TitleMetadataRecord {
  const cacheKey = computeTitleMetadataCacheKey(title);
  const existing = memory.get(cacheKey);
  if (existing) return existing;

  const initial: TitleMetadataRecord = {
    version: TITLE_METADATA_CACHE_VERSION,
    cacheKey,
    titleId: title.id,
    state: 'localOnly',
    confidence: 0,
    updatedAt: Date.now(),
  };
  memory.set(cacheKey, initial);
  return initial;
}

async function persistRecord(record: TitleMetadataRecord): Promise<void> {
  memory.set(record.cacheKey, record);
  const prism = getPrism();
  if (prism?.metadata?.write) {
    await prism.metadata.write(record);
  } else {
    try {
      localStorage.setItem(`virelia-meta:${record.cacheKey}`, JSON.stringify(record));
    } catch {
      // quota — memory only
    }
  }
  notify();
}

function isValidMetadataRecord(record: TitleMetadataRecord | null | undefined): record is TitleMetadataRecord {
  return Boolean(record && record.version === TITLE_METADATA_CACHE_VERSION);
}

async function loadPersistedRecord(cacheKey: string): Promise<TitleMetadataRecord | null> {
  const prism = getPrism();
  if (prism?.metadata?.read) {
    const record = await prism.metadata.read(cacheKey);
    return isValidMetadataRecord(record) ? normalizePersistedRecord(record) : null;
  }
  try {
    const raw = localStorage.getItem(`virelia-meta:${cacheKey}`);
    if (!raw) return null;
    const record = JSON.parse(raw) as TitleMetadataRecord;
    return isValidMetadataRecord(record) ? normalizePersistedRecord(record) : null;
  } catch {
    return null;
  }
}

async function cacheImages(
  metadata: EnrichedTitleMetadata,
  options?: { skipPrimaryPoster?: boolean }
): Promise<{
  cachedMedia?: EnrichedTitleMetadata['media'];
  posterDisplayUrl?: string;
  backdropDisplayUrl?: string;
  posterLocalPath?: string;
  backdropLocalPath?: string;
  screenshotDisplayUrls?: string[];
  screenshotLocalPaths?: string[];
}> {
  let posterDisplayUrl: string | undefined;
  let posterLocalPath: string | undefined;

  if (!options?.skipPrimaryPoster) {
    const primaryPosterUrl = metadata.posterUrl ?? metadata.media?.posters?.[0]?.url;
    const early = await cacheRemotePosterUrl(primaryPosterUrl);
    posterDisplayUrl = early.displayUrl;
    posterLocalPath = early.localPath;
  }

  const cachedMedia = await cacheTitleMediaBundle(metadata.media, {
    skipPosters: options?.skipPrimaryPoster || Boolean(posterDisplayUrl),
  });

  posterDisplayUrl = posterDisplayUrl ?? pickPrimaryPosterUrl(cachedMedia, metadata.posterUrl);
  const backdropDisplayUrl = pickPrimaryBackdropUrl(cachedMedia, metadata.backdropUrl ?? metadata.bannerUrl);
  const resolvedPosterLocalPath = posterLocalPath ?? cachedMedia?.posters?.[0]?.localPath;
  const backdropLocalPath = cachedMedia?.backdrops?.[0]?.localPath ?? cachedMedia?.banners?.[0]?.localPath;

  const screenshotDisplayUrls = [
    ...(cachedMedia?.screenshots?.map((a) => a.displayUrl).filter((u): u is string => Boolean(u)) ?? []),
    ...(cachedMedia?.localFrames?.map((a) => a.displayUrl).filter((u): u is string => Boolean(u)) ?? []),
  ];

  return {
    cachedMedia,
    posterDisplayUrl,
    backdropDisplayUrl,
    posterLocalPath: resolvedPosterLocalPath,
    backdropLocalPath,
    screenshotDisplayUrls: screenshotDisplayUrls.length > 0 ? screenshotDisplayUrls : undefined,
    screenshotLocalPaths: cachedMedia?.screenshots?.map((a) => a.localPath).filter((p): p is string => Boolean(p)),
  };
}

async function enrichTitle(
  title: LibraryTitle,
  options?: { force?: boolean; previous?: TitleMetadataRecord }
): Promise<void> {
  if (isAudioOnlyLibraryTitle(title)) return;
  registerDefaultMetadataProviders();
  const cacheKey = computeTitleMetadataCacheKey(title);
  if (!options?.force && inflight.has(cacheKey)) return;

  const cached = options?.force
    ? options.previous
    : (memory.get(cacheKey) ?? await loadPersistedRecord(cacheKey));
  if (!options?.force && isValidMetadataRecord(cached) && hasUsableMetadata(cached)) {
    memory.set(cacheKey, cached);
    notify();
    return;
  }
  if (!options?.force && cached && isMetadataFailureCooldownActive(cached.failedAt)) {
    const staleNeedsReview = cached.state === 'metadataNeedsReview' && !cached.metadata;
    if (!staleNeedsReview) {
      memory.set(cacheKey, cached);
      return;
    }
  }

  if (!resolveOnlineMetadataEnabled()) return;

  inflight.add(cacheKey);
  const loadingBase = cached ?? getTitleMetadataRecord(title);
  const loading: TitleMetadataRecord = {
    ...loadingBase,
    state: 'metadataLoading',
    updatedAt: Date.now(),
    ...(options?.force ? { failedAt: undefined } : {}),
  };
  memory.set(cacheKey, loading);
  notify();

  try {
    const enriched = await withTimeout(
      enrichTitleOnline(title, cacheKey),
      METADATA_ENRICH_TIMEOUT_MS,
      'metadata enrich'
    );
    const latest = memory.get(cacheKey);
    if (
      latest?.state === 'metadataFailed'
      && options?.previous
      && hasUsableMetadata(options.previous)
    ) {
      await persistRecord({ ...options.previous, updatedAt: Date.now() });
    } else if (enriched) {
      const runExtras = () => enrichTitleMetadataExtras(
        cacheKey,
        enriched.details,
        enriched.skipPrimaryPoster,
        { replaceScreenshots: Boolean(options?.force) }
      );
      if (options?.force) {
        await withTimeout(runExtras(), 45_000, 'metadata images').catch(() => undefined);
      } else {
        void runExtras().catch(() => undefined);
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[metadata] enrich failed', title.id, error);
    }
    if (options?.previous && hasUsableMetadata(options.previous)) {
      await persistRecord({ ...options.previous, updatedAt: Date.now() });
    } else {
      const partial = memory.get(cacheKey);
      if (partial?.metadata && (partial.posterDisplayUrl || partial.metadata.posterUrl)) {
        await persistRecord({
          ...partial,
          version: TITLE_METADATA_CACHE_VERSION,
          state: 'metadataNeedsReview',
          updatedAt: Date.now(),
        });
      } else {
        const failed: TitleMetadataRecord = {
          version: TITLE_METADATA_CACHE_VERSION,
          cacheKey,
          titleId: title.id,
          state: 'metadataFailed',
          confidence: 0,
          failedAt: Date.now(),
          updatedAt: Date.now(),
        };
        await persistRecord(failed);
      }
    }
  } finally {
    inflight.delete(cacheKey);
  }
}

async function searchMetadataCandidates(
  matchInput: ReturnType<typeof buildTitleMatchInput>,
  searchQueries: string[]
): Promise<MetadataSearchResult[]> {
  const providers = listMetadataProviders().filter((provider) => provider.id !== 'tmdb');
  const kinds: Array<'movie' | 'series' | 'anime'> = (() => {
    if (matchInput.mediaType === 'movie' || matchInput.mediaType === 'ova') {
      return ['movie', 'anime'];
    }
    if (matchInput.mediaType === 'series') return ['series', 'anime'];
    return ['anime'];
  })();
  const bundles = await Promise.all(
    searchQueries.flatMap((queryTitle) =>
      kinds.flatMap((kind) =>
        providers.map(async (provider) => {
          try {
            return await provider.search({
              title: queryTitle,
              kind,
              year: matchInput.year,
              language: displayLanguage,
            });
          } catch {
            return [];
          }
        })
      )
    )
  );
  const seenCandidateIds = new Set<string>();
  const allCandidates: MetadataSearchResult[] = [];
  for (const results of bundles) {
    for (const result of results) {
      const dedupeKey = `${result.providerId}:${result.providerMediaId}`;
      if (seenCandidateIds.has(dedupeKey)) continue;
      seenCandidateIds.add(dedupeKey);
      allCandidates.push(result);
    }
  }
  return allCandidates;
}

async function reconcileMediaSupplement(
  title: LibraryTitle,
  record: TitleMetadataRecord
): Promise<void> {
  if (!record.metadata || !resolveOnlineMetadataEnabled()) return;
  const cacheKey = record.cacheKey;
  if (reconcileInflight.has(cacheKey)) return;

  const malId = record.metadata.externalIds?.mal
    ?? (record.metadata.sourceProvider === 'jikan' ? Number(record.metadata.providerMediaId) : undefined);
  if (!malId || !Number.isFinite(malId)) return;

  const existingPosterCount = record.cachedMedia?.posters?.length
    ?? record.metadata.media?.posters?.length
    ?? 0;
  if (existingPosterCount > 3) return;

  reconcileInflight.add(cacheKey);
  notify();
  try {
    const supplemented = await attachMediaSupplement(record.metadata);
    const newPosterCount = supplemented.media?.posters?.length ?? 0;
    if (newPosterCount <= existingPosterCount) return;

    const images = await cacheImages(supplemented, {
      skipPrimaryPoster: Boolean(record.posterDisplayUrl),
    }).catch(() => ({}));
    const current = memory.get(cacheKey) ?? record;
    if (!current.metadata || current.state === 'metadataFailed') return;
    await persistRecord({
      ...current,
      metadata: supplemented,
      ...images,
      updatedAt: Date.now(),
    });
  } finally {
    reconcileInflight.delete(cacheKey);
    notify();
  }
}

async function tryDirectAliasMatch(
  title: LibraryTitle,
  matchInput: ReturnType<typeof buildTitleMatchInput>
): Promise<{ best?: MetadataSearchResult; confidence: number } | null> {
  const alias = findWorkAlias(matchInput.title)
    ?? findWorkAlias(title.canonicalTitle || '')
    ?? findWorkAlias(title.displayTitle)
    ?? findSeriesAlias(matchInput.title)
    ?? findSeriesAlias(title.canonicalTitle || '')
    ?? findSeriesAlias(title.displayTitle);
  if (!alias?.anilistId) return null;

  const provider = listMetadataProviders().find((p) => p.id === 'anilist');
  if (!provider) return null;

  const rawDetails = await provider.getDetails(String(alias.anilistId), displayLanguage, 0.88);
  if (!rawDetails) return null;

  const details = asEnrichedMetadata(rawDetails);
  const kind: MetadataSearchResult['kind'] = matchInput.mediaType === 'movie'
    ? 'movie'
    : matchInput.mediaType === 'series'
      ? 'series'
      : 'anime';
  return {
    best: {
      providerId: 'anilist',
      providerMediaId: String(alias.anilistId),
      title: details.canonicalTitle ?? details.localizedTitle ?? alias.titles.en ?? matchInput.title,
      year: details.year ?? matchInput.year,
      kind,
      confidence: 0.88,
    },
    confidence: 0.88,
  };
}

async function enrichTitleMetadataExtras(
  cacheKey: string,
  baseDetails: EnrichedTitleMetadata,
  skipPrimaryPoster: boolean,
  options?: { replaceScreenshots?: boolean }
): Promise<void> {
  extrasInflight.add(cacheKey);
  notify();
  try {
    const supplemented = await attachMediaSupplement(baseDetails, {
      replaceScreenshots: options?.replaceScreenshots,
    });
    const images = await cacheImages(supplemented, { skipPrimaryPoster }).catch(() => ({}));
    const current = memory.get(cacheKey);
    if (!current || current.state === 'metadataFailed') return;
    await persistRecord({
      ...current,
      metadata: supplemented,
      ...images,
      updatedAt: Date.now(),
    });
  } finally {
    extrasInflight.delete(cacheKey);
    notify();
  }
}

async function enrichTitleOnline(
  title: LibraryTitle,
  cacheKey: string
): Promise<{ details: EnrichedTitleMetadata; skipPrimaryPoster: boolean } | undefined> {
  const matchInput = buildTitleMatchInput(title);
  const workAlias = findWorkAlias(matchInput.title)
    ?? findWorkAlias(title.canonicalTitle || '')
    ?? findWorkAlias(title.displayTitle);
  const seriesAlias = findSeriesAlias(matchInput.title)
    ?? findSeriesAlias(title.canonicalTitle || '')
    ?? findSeriesAlias(title.displayTitle);
  const searchQueries = [...new Set([
    matchInput.title,
    ...(matchInput.aliases ?? []).slice(0, 2),
    workAlias?.titles.en,
    workAlias?.titles.romaji,
    seriesAlias?.titles.en,
    seriesAlias?.titles.romaji,
    title.items[0]?.fileName ? cleanMovieSearchTitle(title.items[0].fileName) : undefined,
  ].filter((value): value is string => Boolean(value)))].slice(0, 5);
  const allCandidates = await searchMetadataCandidates(matchInput, searchQueries);

  const { best: initialBest, confidence: initialConfidence, needsReview } = pickBestMetadataMatch(matchInput, allCandidates);
  let best = initialBest;
  let confidence = initialConfidence;
  let review = needsReview;

  if (!best && allCandidates.length > 0) {
    const scored = allCandidates
      .map((candidate) => ({
        candidate,
        score: scoreMetadataCandidate(matchInput, candidate),
      }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    if (top && top.score >= 0.55 && (!second || top.score - second.score >= 0.08)) {
      best = top.candidate;
      confidence = top.score;
    }
  }

  if (!best) {
    const direct = await tryDirectAliasMatch(title, matchInput);
    if (direct?.best) {
      best = direct.best;
      confidence = direct.confidence;
      review = false;
    }
  }

  if (!best) {
    const failed: TitleMetadataRecord = {
      version: TITLE_METADATA_CACHE_VERSION,
      cacheKey,
      titleId: title.id,
      state: 'metadataFailed',
      confidence,
      matchQuery: matchInput.title,
      appliedTo: 'parentTitle',
      candidates: allCandidates.slice(0, 5).map((c) => ({
        providerId: c.providerId,
        providerMediaId: c.providerMediaId,
        title: c.title,
        year: c.year,
        confidence: c.confidence,
      })),
      failedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await persistRecord(failed);
    return undefined;
  }

  const provider = listMetadataProviders().find((p) => p.id === best.providerId);
  if (!provider) throw new Error('provider missing');

  const rawDetails = await provider.getDetails(best.providerMediaId, displayLanguage, confidence);
  if (!rawDetails) throw new Error('no details');
  const details = asEnrichedMetadata(rawDetails);

  const primaryPosterUrl = primaryPosterFromDetails(rawDetails);
  let posterImages: Awaited<ReturnType<typeof cacheImages>> = {};
  if (primaryPosterUrl?.startsWith('http')) {
    const earlyPoster = await cacheRemotePosterUrl(primaryPosterUrl);
    if (earlyPoster.displayUrl) {
      posterImages = {
        posterDisplayUrl: earlyPoster.displayUrl,
        posterLocalPath: earlyPoster.localPath,
      };
    }
  }

  const ready: TitleMetadataRecord = {
    version: TITLE_METADATA_CACHE_VERSION,
    cacheKey,
    titleId: title.id,
    state: review ? 'metadataNeedsReview' : 'metadataReady',
    metadata: details,
    confidence,
    matchQuery: matchInput.title,
    matchedProvider: best.providerId,
    matchedTitle: best.title,
    appliedTo: 'parentTitle',
    posterSource: posterImages.posterDisplayUrl ? 'online' : undefined,
    ...posterImages,
    fetchedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await persistRecord(ready);

  return {
    details,
    skipPrimaryPoster: Boolean(primaryPosterUrl?.startsWith('http')),
  };
}

function pumpQueue(): void {
  if (processing || queue.length === 0) return;
  processing = true;

  void (async () => {
    while (queue.length > 0) {
      queue.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);
      const job = queue.shift();
      if (!job) break;
      await enrichTitle(job.title);
      await new Promise((r) => setTimeout(r, queueDelayMs(job.priority)));
    }
    processing = false;
  })();
}

export function requestTitleMetadata(title: LibraryTitle, priority: MetadataPriority = 'normal'): void {
  if (isAudioOnlyLibraryTitle(title)) return;
  const cacheKey = computeTitleMetadataCacheKey(title);
  const existing = memory.get(cacheKey);
  if (hasUsableMetadata(existing)) return;
  if (isStaleMetadataLoading(existing)) {
    inflight.delete(cacheKey);
    memory.delete(cacheKey);
  } else if (existing?.state === 'metadataLoading' || inflight.has(cacheKey)) {
    const queued = queue.find((q) => q.title.id === title.id);
    if (queued && PRIORITY_WEIGHT[priority] < PRIORITY_WEIGHT[queued.priority]) {
      queued.priority = priority;
    }
    return;
  }
  if (existing && isMetadataFailureCooldownActive(existing.failedAt) && priority !== 'critical') return;

  const queued = queue.find((q) => q.title.id === title.id);
  if (queued) {
    if (PRIORITY_WEIGHT[priority] < PRIORITY_WEIGHT[queued.priority]) {
      queued.priority = priority;
    }
    pumpQueue();
    return;
  }

  queue.push({ title, priority });
  pumpQueue();
}

export async function prefetchTitleMetadataBatch(
  titles: LibraryTitle[],
  priority: MetadataPriority = 'high',
  limit = 48
): Promise<void> {
  const eligible = titles.filter((title) => !isAudioOnlyLibraryTitle(title));
  const slice = eligible.slice(0, limit);
  if (slice.length === 0) return;
  await hydrateTitleMetadataFromDisk(slice);
  for (const title of slice) {
    const record = memory.get(computeTitleMetadataCacheKey(title));
    if (hasUsableMetadata(record)) continue;
    if (record?.state === 'metadataFailed' && isMetadataFailureCooldownActive(record.failedAt)) continue;
    requestTitleMetadata(title, priority);
  }
}

export async function refreshTitleMetadata(title: LibraryTitle): Promise<MetadataRefreshResult> {
  const cacheKey = computeTitleMetadataCacheKey(title);
  markTitleMetadataRefreshStarted(title);

  try {
    const previous = memory.get(cacheKey) ?? await loadPersistedRecord(cacheKey) ?? undefined;

    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (computeTitleMetadataCacheKey(queue[i]!.title) === cacheKey) {
        queue.splice(i, 1);
      }
    }
    inflight.delete(cacheKey);

    if (!resolveOnlineMetadataEnabled()) {
      if (previous) {
        await persistRecord({
          ...previous,
          state: previous.state === 'metadataLoading' ? 'localOnly' : previous.state,
          updatedAt: Date.now(),
        });
      }
      return {
        record: previous ?? getTitleMetadataRecord(title),
        notice: 'offline',
      };
    }

    await enrichTitle(title, { force: true, previous });
    const result = getTitleMetadataRecord(title);
    if (result.state === 'metadataFailed' && previous && hasUsableMetadata(previous)) {
      await persistRecord({ ...previous, updatedAt: Date.now() });
      return { record: previous, notice: 'restored' };
    }
    if (result.state === 'metadataFailed') {
      return { record: result, notice: 'failed' };
    }
    return { record: result, notice: 'updated' };
  } finally {
    clearTitleMetadataRefreshMark(cacheKey);
    notify();
  }
}

export async function hydrateTitleMetadataFromDisk(titles: LibraryTitle[]): Promise<void> {
  const eligible = titles.filter((title) => !isAudioOnlyLibraryTitle(title));
  let changed = false;
  for (const title of eligible) {
    const cacheKey = computeTitleMetadataCacheKey(title);
    const memoryRecord = memory.get(cacheKey);
    if (hasUsableMetadata(memoryRecord)) continue;

    const persisted = await loadPersistedRecord(cacheKey);
    if (!persisted) continue;
    memory.set(cacheKey, persisted);
    changed = true;
  }
  if (changed) notify();
}

export function getTitleMetadataActivity(title: LibraryTitle): 'idle' | 'search' | 'images' {
  const cacheKey = computeTitleMetadataCacheKey(title);
  if (refreshMarks.has(cacheKey) || inflight.has(cacheKey)) return 'search';
  const record = memory.get(cacheKey);
  if (record?.state === 'metadataLoading') return 'search';
  if (extrasInflight.has(cacheKey) || reconcileInflight.has(cacheKey)) return 'images';
  return 'idle';
}

export function isOnlineMetadataEnabled(): boolean {
  return resolveOnlineMetadataEnabled();
}

export function isTitleMetadataBusy(title: LibraryTitle): boolean {
  return getTitleMetadataActivity(title) !== 'idle';
}
