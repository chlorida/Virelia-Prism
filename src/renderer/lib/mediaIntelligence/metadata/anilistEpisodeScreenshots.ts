import type { TitleMediaAsset } from '../../../../shared/titleMetadataTypes';
import { createRemoteAsset } from './metadataMediaAssets';

const MAX_EPISODE_SCREENSHOTS = 24;

interface StreamingEpisode {
  title?: string;
  thumbnail?: string;
}

interface AnilistStreamingResponse {
  Media?: {
    streamingEpisodes?: StreamingEpisode[];
  } | null;
}

async function anilistStreamingRequest(
  variables: Record<string, unknown>,
): Promise<StreamingEpisode[]> {
  const query = `
    query ($id: Int, $idMal: Int) {
      Media(id: $id, idMal: $idMal, type: ANIME) {
        streamingEpisodes {
          title
          thumbnail
        }
      }
    }
  `;

  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) return [];

  const json = await response.json() as { data?: AnilistStreamingResponse; errors?: unknown[] };
  if (json.errors?.length) return [];
  return json.data?.Media?.streamingEpisodes ?? [];
}

export async function fetchAnilistEpisodeScreenshots(options: {
  anilistId?: number;
  malId?: number;
}): Promise<TitleMediaAsset[]> {
  const anilistId = options.anilistId && Number.isFinite(options.anilistId) ? options.anilistId : undefined;
  const malId = options.malId && Number.isFinite(options.malId) ? options.malId : undefined;
  if (!anilistId && !malId) return [];

  const episodes = await anilistStreamingRequest(
    anilistId ? { id: anilistId } : { idMal: malId },
  );

  const screenshots: TitleMediaAsset[] = [];
  for (const [index, episode] of episodes.entries()) {
    const asset = createRemoteAsset('screenshot', episode.thumbnail, 'anilist', episode.title);
    if (!asset) continue;
    screenshots.push({
      ...asset,
      episodeNumber: index + 1,
      confidence: 0.82,
    });
    if (screenshots.length >= MAX_EPISODE_SCREENSHOTS) break;
  }
  return screenshots;
}
