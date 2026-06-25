import type { EnrichedTitleMetadata } from '../../../../../shared/titleMetadataTypes';
import { sanitizeMetadataDescription } from '../../../../../shared/titleMetadataCache';
import { createRemoteAsset } from '../metadataMediaAssets';
import type { MetadataProvider, MetadataSearchQuery, MetadataSearchResult } from '../types';

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  type?: string;
  year?: number;
  episodes?: number;
  score?: number;
  popularity?: number;
  genres?: Array<{ name: string }>;
  synopsis?: string;
  images?: { jpg?: { large_image_url?: string }; webp?: { large_image_url?: string } };
}

function mapJikanKind(type?: string): MetadataSearchResult['kind'] {
  const t = (type ?? '').toLowerCase();
  if (t.includes('movie')) return 'movie';
  if (t.includes('tv')) return 'series';
  return 'anime';
}

async function jikanFetch<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.jikan.moe/v4${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Jikan HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const jikanProvider: MetadataProvider = {
  id: 'jikan',
  name: 'Jikan (MAL)',
  async search(query: MetadataSearchQuery): Promise<MetadataSearchResult[]> {
    const encoded = encodeURIComponent(query.title);
    const data = await jikanFetch<{ data: JikanAnime[] }>(`/anime?q=${encoded}&limit=8`);
    return (data.data ?? []).map((item) => ({
      providerId: 'jikan',
      providerMediaId: String(item.mal_id),
      title: item.title_english || item.title,
      year: item.year,
      kind: mapJikanKind(item.type),
      confidence: 0.5,
    }));
  },
  async getDetails(id: string, _language: string, confidence = 0.75): Promise<EnrichedTitleMetadata | null> {
    const data = await jikanFetch<{ data: JikanAnime }>(`/anime/${id}`);
    const item = data.data;
    if (!item) return null;
    const poster = item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url;
    const posters = [createRemoteAsset('poster', poster, 'jikan')].filter((a): a is NonNullable<typeof a> => Boolean(a));
    return {
      canonicalTitle: item.title_english || item.title,
      localizedTitle: item.title_english,
      originalTitle: item.title_japanese,
      aliases: [item.title, item.title_english, item.title_japanese].filter(
        (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i
      ),
      year: item.year,
      type: 'anime',
      format: item.type,
      description: sanitizeMetadataDescription(item.synopsis),
      genres: item.genres?.map((g) => g.name),
      rating: item.score,
      popularity: item.popularity,
      episodeCount: item.episodes ?? undefined,
      posterUrl: poster,
      backdropUrl: poster,
      media: {
        posters,
        backdrops: posters.length > 0 ? [...posters] : undefined,
        trailer: null,
      },
      externalIds: { mal: item.mal_id },
      sourceProvider: 'jikan',
      providerMediaId: String(item.mal_id),
      confidence,
    };
  },
};
