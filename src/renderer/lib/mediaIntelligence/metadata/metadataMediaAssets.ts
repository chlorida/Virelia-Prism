import type {
  MetadataImageKind,
  TitleMediaAsset,
  TitleMediaAssetKind,
  TitleMediaBundle,
} from '../../../../shared/titleMetadataTypes';
import { getPrism } from '../../prismApi';

function assetId(kind: string, source: string, remoteUrl: string): string {
  return `${kind}-${source}-${remoteUrl.slice(-32)}`;
}

export function createRemoteAsset(
  kind: TitleMediaAssetKind,
  remoteUrl: string | undefined,
  source: TitleMediaAsset['source'],
  label?: string
): TitleMediaAsset | undefined {
  if (!remoteUrl?.startsWith('http')) return undefined;
  return {
    id: assetId(kind, source, remoteUrl),
    kind,
    url: remoteUrl,
    originalUrl: remoteUrl,
    source,
    label,
  };
}

function cacheKindForAsset(kind: TitleMediaAssetKind): MetadataImageKind {
  if (kind === 'trailerThumbnail') return 'trailer';
  if (kind === 'localFrame') return 'screenshot';
  if (kind === 'screenshot') return 'screenshot';
  if (kind === 'banner') return 'banner';
  if (kind === 'backdrop') return 'backdrop';
  return 'poster';
}

async function cacheAsset(asset: TitleMediaAsset, throttleMs = 80): Promise<TitleMediaAsset> {
  const remote = asset.url ?? asset.originalUrl;
  if (!remote?.startsWith('http')) return asset;

  const prism = getPrism();
  if (!prism?.metadata?.cacheImage) {
    return { ...asset, displayUrl: remote };
  }

  const cached = await prism.metadata.cacheImage(remote, cacheKindForAsset(asset.kind));
  if (throttleMs > 0) {
    await new Promise((r) => setTimeout(r, throttleMs));
  }
  return {
    ...asset,
    localPath: cached.localPath,
    displayUrl: cached.displayUrl ?? remote,
  };
}

async function cacheAssetList(
  assets?: TitleMediaAsset[],
  throttleMs = 80
): Promise<TitleMediaAsset[] | undefined> {
  if (!assets?.length) return undefined;
  const out: TitleMediaAsset[] = [];
  for (const asset of assets) {
    out.push(await cacheAsset(asset, throttleMs));
  }
  return out;
}

/** Cache a single remote poster URL to disk (highest UI priority). */
export async function cacheRemotePosterUrl(remoteUrl: string | undefined): Promise<{
  displayUrl?: string;
  localPath?: string;
}> {
  if (!remoteUrl?.startsWith('http')) return {};
  const prism = getPrism();
  if (!prism?.metadata?.cacheImage) return { displayUrl: remoteUrl };
  const cached = await prism.metadata.cacheImage(remoteUrl, 'poster');
  return { displayUrl: cached.displayUrl ?? remoteUrl, localPath: cached.localPath };
}

export async function cacheTitleMediaBundle(
  media?: TitleMediaBundle,
  options?: { skipPosters?: boolean }
): Promise<TitleMediaBundle | undefined> {
  if (!media) return undefined;

  const posters = options?.skipPosters
    ? media.posters
    : await cacheAssetList(media.posters, 0);

  const [backdrops, banners, screenshots, trailerThumbnails, localFrames] = await Promise.all([
    cacheAssetList(media.backdrops),
    cacheAssetList(media.banners),
    cacheAssetList(media.screenshots),
    cacheAssetList(media.trailerThumbnails),
    cacheAssetList(media.localFrames),
  ]);

  return {
    trailer: media.trailer,
    posters,
    backdrops,
    banners,
    screenshots,
    trailerThumbnails,
    localFrames,
  };
}

export function hasTitleMedia(
  media?: TitleMediaBundle,
  legacy?: { trailerUrl?: string; posterDisplayUrl?: string; backdropDisplayUrl?: string }
): boolean {
  if (!media) {
    return Boolean(legacy?.trailerUrl || legacy?.posterDisplayUrl || legacy?.backdropDisplayUrl);
  }
  return Boolean(
    media.trailer?.url
    || (media.posters?.length ?? 0) > 0
    || (media.backdrops?.length ?? 0) > 0
    || (media.banners?.length ?? 0) > 0
    || (media.screenshots?.length ?? 0) > 0
    || (media.trailerThumbnails?.length ?? 0) > 0
    || (media.localFrames?.length ?? 0) > 0
  );
}

export function pickPrimaryPosterUrl(
  media?: TitleMediaBundle,
  fallback?: string
): string | undefined {
  return media?.posters?.[0]?.displayUrl ?? media?.posters?.[0]?.url ?? fallback;
}

export function pickPrimaryBackdropUrl(
  media?: TitleMediaBundle,
  fallback?: string
): string | undefined {
  return (
    media?.backdrops?.[0]?.displayUrl
    ?? media?.banners?.[0]?.displayUrl
    ?? media?.backdrops?.[0]?.url
    ?? media?.banners?.[0]?.url
    ?? fallback
  );
}
