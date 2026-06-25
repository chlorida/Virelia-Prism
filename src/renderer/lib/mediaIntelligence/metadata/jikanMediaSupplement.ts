import type { TitleMediaAsset, TitleTrailer } from '../../../../shared/titleMetadataTypes';
import { createRemoteAsset } from './metadataMediaAssets';

interface JikanPictureEntry {
  jpg?: { image_url?: string };
  webp?: { image_url?: string };
}

interface JikanPromoVideo {
  title?: string;
  trailer?: {
    youtube_id?: string | null;
    url?: string | null;
    embed_url?: string | null;
  };
}

interface JikanVideosPayload {
  promo?: JikanPromoVideo[];
  episodes?: JikanPromoVideo[];
  music_videos?: JikanPromoVideo[];
}

async function jikanFetch<T>(path: string, attempt = 0): Promise<T | null> {
  try {
    const response = await fetch(`https://api.jikan.moe/v4${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      return jikanFetch<T>(path, attempt + 1);
    }
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

function parseYoutubeId(url: string): string | undefined {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1];
}

function trailerFromPromo(entry: JikanPromoVideo): TitleTrailer | null {
  const trailer = entry.trailer;
  if (!trailer) return null;

  if (trailer.youtube_id) {
    return {
      site: 'youtube',
      id: trailer.youtube_id,
      url: `https://www.youtube.com/watch?v=${trailer.youtube_id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${trailer.youtube_id}/hqdefault.jpg`,
    };
  }

  const embedOrUrl = trailer.embed_url ?? trailer.url;
  if (!embedOrUrl) return null;

  const youtubeId = parseYoutubeId(embedOrUrl);
  if (youtubeId) {
    return {
      site: 'youtube',
      id: youtubeId,
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  if (embedOrUrl.startsWith('http')) {
    return { site: 'unknown', url: embedOrUrl };
  }

  return null;
}

function pickPromoTrailer(entries: JikanPromoVideo[]): TitleTrailer | null {
  const promo = entries.find((entry) => {
    const title = (entry.title ?? '').toLowerCase();
    return title.includes('promo') || title.includes('trailer') || title.includes('pv');
  });
  const ordered = promo ? [promo, ...entries.filter((entry) => entry !== promo)] : entries;
  for (const entry of ordered) {
    const trailer = trailerFromPromo(entry);
    if (trailer?.url || trailer?.id) return trailer;
  }
  return null;
}

function flattenPromoVideos(data?: JikanVideosPayload | JikanPromoVideo[] | null): JikanPromoVideo[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return [
    ...(data.promo ?? []),
    ...(data.episodes ?? []),
    ...(data.music_videos ?? []),
  ];
}

export async function fetchJikanMediaSupplement(malId: number): Promise<{
  /** MAL promotional artwork — not episode frame grabs. */
  promotionalArt: TitleMediaAsset[];
  trailer?: TitleTrailer | null;
}> {
  const picturesData = await jikanFetch<{ data?: JikanPictureEntry[] }>(`/anime/${malId}/pictures`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const videosData = await jikanFetch<{ data?: JikanVideosPayload | JikanPromoVideo[] }>(`/anime/${malId}/videos`);

  const promotionalArt: TitleMediaAsset[] = [];
  for (const entry of picturesData?.data ?? []) {
    const url = entry.webp?.image_url ?? entry.jpg?.image_url;
    const asset = createRemoteAsset('poster', url, 'jikan');
    if (asset) promotionalArt.push(asset);
  }

  const trailer = pickPromoTrailer(flattenPromoVideos(videosData?.data));
  return { promotionalArt, trailer };
}
