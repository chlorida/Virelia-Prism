import type {
  CharacterMetadata,
  EnrichedTitleMetadata,
  MetadataPerson,
  MetadataRelations,
  MetadataStaff,
  RelatedRelationType,
  RelatedTitle,
  TitleMediaBundle,
} from '../../../../../shared/titleMetadataTypes';
import { sanitizeMetadataDescription } from '../../../../../shared/titleMetadataCache';
import { createRemoteAsset } from '../metadataMediaAssets';
import { fetchWithRetry } from '../../../network/fetchWithRetry';
import type { MetadataProvider, MetadataSearchQuery, MetadataSearchResult } from '../types';
import type { TitleTrailer } from '../../../../../shared/titleMetadataTypes';

interface AniListName { full?: string }
interface AniListMediaTitle { romaji?: string; english?: string; native?: string }

interface AniListMedia {
  id: number;
  siteUrl?: string;
  format?: string;
  status?: string;
  episodes?: number;
  duration?: number;
  season?: string;
  seasonYear?: number;
  startDate?: { year?: number; month?: number; day?: number };
  endDate?: { year?: number; month?: number; day?: number };
  averageScore?: number;
  popularity?: number;
  genres?: string[];
  tags?: Array<{ name?: string; category?: string; rank?: number }>;
  description?: string;
  source?: string;
  countryOfOrigin?: string;
  isAdult?: boolean;
  title?: AniListMediaTitle;
  coverImage?: { extraLarge?: string; large?: string };
  bannerImage?: string;
  studios?: { nodes?: Array<{ name?: string }> };
  relations?: {
    edges?: Array<{
      relationType?: string;
      node?: {
        id?: number;
        format?: string;
        seasonYear?: number;
        siteUrl?: string;
        title?: AniListMediaTitle;
        coverImage?: { large?: string };
      };
    }>;
  };
  staff?: { edges?: Array<{ role?: string; node?: { name?: AniListName } }> };
  characters?: {
    edges?: Array<{
      role?: string;
      node?: { id?: number; name?: AniListName; image?: { large?: string; medium?: string } };
      voiceActors?: Array<{ id?: number; name?: AniListName; image?: { medium?: string } }>;
    }>;
  };
  trailer?: { id?: string; site?: string; thumbnail?: string };
  idMal?: number;
}

async function anilistRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetchWithRetry('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    timeoutMs: 25_000,
    attempts: 3,
    retryDelayMs: 1_200,
    retryOnStatuses: [429, 502, 503, 504],
  });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const json = await response.json() as { data?: T; errors?: unknown[] };
  if (json.errors?.length) throw new Error('AniList GraphQL error');
  if (!json.data) throw new Error('AniList empty response');
  return json.data;
}

function buildTrailerUrl(trailer?: { id?: string; site?: string }): string | undefined {
  if (!trailer?.id) return undefined;
  const site = trailer.site?.toLowerCase();
  if (site === 'youtube') return `https://www.youtube.com/watch?v=${trailer.id}`;
  if (site === 'dailymotion') return `https://www.dailymotion.com/video/${trailer.id}`;
  return undefined;
}

function buildTrailerSite(trailer?: { site?: string }): TitleTrailer['site'] {
  const site = trailer?.site?.toLowerCase();
  if (site === 'youtube') return 'youtube';
  if (site === 'dailymotion') return 'dailymotion';
  return 'unknown';
}

function mapFormatToKind(format?: string): MetadataSearchResult['kind'] {
  if (format === 'MOVIE') return 'movie';
  if (format === 'TV' || format === 'TV_SHORT') return 'series';
  return 'anime';
}

function mapRelationType(type?: string): RelatedRelationType {
  switch (type) {
    case 'PREQUEL': return 'prequel';
    case 'SEQUEL': return 'sequel';
    case 'SIDE_STORY': return 'side_story';
    case 'SPIN_OFF': return 'spin_off';
    case 'PARENT': return 'parent';
    case 'SUMMARY': return 'summary';
    case 'ALTERNATIVE': return 'alternative';
    case 'ADAPTATION': return 'adaptation';
    case 'CHARACTER': return 'character';
    case 'RECOMMENDATION': return 'recommendation';
    default: return 'other';
  }
}

function formatAniListDate(date?: { year?: number; month?: number; day?: number }): string | undefined {
  if (!date?.year) return undefined;
  const month = date.month ? String(date.month).padStart(2, '0') : '01';
  const day = date.day ? String(date.day).padStart(2, '0') : '01';
  return `${date.year}-${month}-${day}`;
}

function person(name?: string, role?: string, character?: string, imageUrl?: string): MetadataPerson | undefined {
  if (!name?.trim()) return undefined;
  return { name: name.trim(), role, character, imageUrl };
}

function mapRelatedTitles(media: AniListMedia): RelatedTitle[] {
  const out: RelatedTitle[] = [];
  for (const edge of media.relations?.edges ?? []) {
    const node = edge.node;
    if (!node?.id) continue;
    const title = node.title?.english || node.title?.romaji || node.title?.native;
    if (!title) continue;
    const coverUrl = node.coverImage?.large;
    out.push({
      id: `anilist-${node.id}`,
      provider: 'anilist',
      providerId: node.id,
      title,
      englishTitle: node.title?.english,
      nativeTitle: node.title?.native,
      romajiTitle: node.title?.romaji,
      relationType: mapRelationType(edge.relationType),
      year: node.seasonYear,
      format: node.format,
      externalUrl: node.siteUrl ?? `https://anilist.co/anime/${node.id}`,
      coverImage: createRemoteAsset('poster', coverUrl, 'anilist'),
    });
  }
  return out;
}

function mapLegacyRelations(related: RelatedTitle[]): MetadataRelations | undefined {
  if (related.length === 0) return undefined;
  const relations: MetadataRelations = {};
  const put = (key: keyof MetadataRelations, item: RelatedTitle) => {
    const legacy = {
      providerMediaId: String(item.providerId ?? item.id),
      title: item.title,
      year: item.year,
      format: item.format,
      relationType: item.relationType,
    };
    if (!relations[key]) relations[key] = [];
    relations[key]!.push(legacy);
  };

  for (const item of related) {
    switch (item.relationType) {
      case 'sequel': put('sequel', item); break;
      case 'prequel': put('prequel', item); break;
      case 'side_story': put('sideStory', item); break;
      case 'spin_off': put('spinOff', item); break;
      case 'alternative': put('alternativeVersion', item); break;
      case 'recommendation': put('recommendations', item); break;
      default: put('similarTitles', item); break;
    }
  }
  return relations;
}

function mapCharacterRole(role?: string): CharacterMetadata['role'] {
  const r = (role ?? '').toUpperCase();
  if (r.includes('MAIN')) return 'main';
  if (r.includes('SUPPORTING')) return 'supporting';
  if (r.includes('BACKGROUND')) return 'background';
  return 'unknown';
}

function mapCharacters(media: AniListMedia): CharacterMetadata[] {
  const out: CharacterMetadata[] = [];
  for (const edge of media.characters?.edges ?? []) {
    const node = edge.node;
    const name = node?.name?.full;
    if (!name || !node?.id) continue;
    out.push({
      id: `anilist-char-${node.id}`,
      provider: 'anilist',
      providerId: node.id,
      name,
      image: createRemoteAsset('poster', node.image?.medium, 'anilist', name),
      role: mapCharacterRole(edge.role),
      voiceActors: (edge.voiceActors ?? []).map((va) => ({
        name: va.name?.full ?? 'Unknown',
        role: 'Voice',
        imageUrl: va.image?.medium,
      })).filter((v) => v.name !== 'Unknown'),
    });
  }
  return out.slice(0, 24);
}

function mapStaffAndCast(media: AniListMedia): {
  staff?: MetadataStaff;
  cast?: MetadataPerson[];
  voiceActors?: MetadataPerson[];
} {
  const staff: MetadataStaff = {};
  const cast: MetadataPerson[] = [];
  const voiceActors: MetadataPerson[] = [];

  const roleBucket = (role: string): keyof MetadataStaff | 'cast' | 'voice' => {
    const r = role.toLowerCase();
    if (r.includes('director')) return 'directors';
    if (r.includes('original creator') || r === 'creator') return 'creators';
    if (r.includes('story') || r.includes('writer') || r.includes('series composition')) return 'writers';
    if (r.includes('producer')) return 'producers';
    if (r.includes('music') || r.includes('composer') || r.includes('sound')) return 'composers';
    if (r.includes('main') || r.includes('supporting')) return 'cast';
    return 'voice';
  };

  for (const edge of media.staff?.edges ?? []) {
    const name = edge.node?.name?.full;
    const role = edge.role ?? 'Staff';
    const bucket = roleBucket(role);
    if (bucket === 'cast' || bucket === 'voice') continue;
    const list = staff[bucket] ?? [];
    const entry = person(name, role);
    if (entry) list.push(entry);
    staff[bucket] = list;
  }

  for (const edge of media.characters?.edges ?? []) {
    const character = edge.node?.name?.full;
    const charRole = edge.role ?? 'Character';
    const entry = person(character, charRole);
    if (entry) cast.push(entry);
    for (const va of edge.voiceActors ?? []) {
      const vaEntry = person(va.name?.full, 'Voice', character, va.image?.medium);
      if (vaEntry) voiceActors.push(vaEntry);
    }
  }

  const hasStaff = Object.values(staff).some((v) => (v?.length ?? 0) > 0);
  return {
    staff: hasStaff ? staff : undefined,
    cast: cast.length > 0 ? cast.slice(0, 24) : undefined,
    voiceActors: voiceActors.length > 0 ? voiceActors.slice(0, 24) : undefined,
  };
}

function buildMediaBundle(
  media: AniListMedia,
  trailerUrl?: string,
  trailerThumb?: string
): TitleMediaBundle {
  const posterUrl = media.coverImage?.extraLarge || media.coverImage?.large;
  const bannerUrl = media.bannerImage;
  const posters = [createRemoteAsset('poster', posterUrl, 'anilist')].filter((a): a is NonNullable<typeof a> => Boolean(a));
  const banners = [createRemoteAsset('banner', bannerUrl, 'anilist')].filter((a): a is NonNullable<typeof a> => Boolean(a));
  const trailerThumbnails = trailerThumb
    ? [createRemoteAsset('trailerThumbnail', trailerThumb, 'anilist')].filter((a): a is NonNullable<typeof a> => Boolean(a))
    : undefined;

  return {
    posters,
    backdrops: undefined,
    banners,
    trailerThumbnails,
    screenshots: undefined,
    localFrames: undefined,
    trailer: trailerUrl
      ? {
          site: buildTrailerSite(media.trailer),
          id: media.trailer?.id,
          url: trailerUrl,
          thumbnailUrl: trailerThumb,
        }
      : null,
  };
}

function toSearchResult(media: AniListMedia): MetadataSearchResult {
  const title = media.title?.english || media.title?.romaji || media.title?.native || 'Unknown';
  return {
    providerId: 'anilist',
    providerMediaId: String(media.id),
    title,
    year: media.seasonYear,
    kind: mapFormatToKind(media.format),
    confidence: 0.55,
  };
}

function toEnriched(media: AniListMedia, confidence: number): EnrichedTitleMetadata {
  const canonical = media.title?.english || media.title?.romaji || media.title?.native || 'Unknown';
  const description = sanitizeMetadataDescription(media.description, 2000);
  const shortDescription = sanitizeMetadataDescription(media.description, 280);
  const { staff, cast, voiceActors } = mapStaffAndCast(media);
  const relatedTitles = mapRelatedTitles(media);
  const characters = mapCharacters(media);
  const tags = (media.tags ?? [])
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .map((t) => t.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 12);

  const trailerUrl = buildTrailerUrl(media.trailer);
  const trailerThumb = media.trailer?.thumbnail;
  const posterUrl = media.coverImage?.extraLarge || media.coverImage?.large;
  const bannerUrl = media.bannerImage;
  const mediaBundle = buildMediaBundle(media, trailerUrl, trailerThumb);

  return {
    canonicalTitle: canonical,
    localizedTitle: media.title?.english,
    originalTitle: media.title?.native,
    englishTitle: media.title?.english,
    romajiTitle: media.title?.romaji,
    aliases: [media.title?.romaji, media.title?.english, media.title?.native].filter(
      (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i
    ),
    year: media.seasonYear,
    startDate: formatAniListDate(media.startDate),
    endDate: formatAniListDate(media.endDate),
    type: 'anime',
    format: media.format,
    description,
    shortDescription: shortDescription !== description ? shortDescription : undefined,
    genres: media.genres,
    tags,
    rating: media.averageScore ? media.averageScore / 10 : undefined,
    popularity: media.popularity,
    episodeCount: media.episodes ?? undefined,
    duration: media.duration ?? undefined,
    season: media.season,
    studios: media.studios?.nodes?.map((n) => n.name).filter((n): n is string => Boolean(n)),
    status: media.status,
    source: media.source,
    country: media.countryOfOrigin,
    ageRating: media.isAdult ? '18+' : undefined,
    posterUrl,
    backdropUrl: bannerUrl,
    bannerUrl,
    trailerUrl,
    trailerThumbnailUrl: trailerThumb,
    media: mediaBundle,
    relatedTitles,
    characters,
    externalIds: { anilist: media.id, mal: media.idMal },
    externalUrl: media.siteUrl,
    staff,
    cast,
    voiceActors,
    related: mapLegacyRelations(relatedTitles),
    sourceProvider: 'anilist',
    providerMediaId: String(media.id),
    confidence,
  };
}

const MEDIA_FIELDS = `
  id idMal siteUrl format status episodes duration season seasonYear
  startDate { year month day } endDate { year month day }
  averageScore popularity genres
  tags { name category rank }
  description(asHtml: false) source countryOfOrigin isAdult
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  studios(isMain: true) { nodes { name } }
`;

const DETAILS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
      trailer { id site thumbnail }
      relations {
        edges {
          relationType
          node {
            id format seasonYear siteUrl
            title { romaji english native }
            coverImage { large }
          }
        }
      }
      staff(perPage: 25, sort: RELEVANCE) {
        edges { role node { name { full } } }
      }
      characters(perPage: 16, sort: ROLE) {
        edges {
          role
          node { id name { full } image { large medium } }
          voiceActors(language: JAPANESE, sort: RELEVANCE) {
            id name { full } image { medium }
          }
        }
      }
    }
  }
`;

const SEARCH_QUERY = `
  query ($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
    }
  }
`;

export const anilistProvider: MetadataProvider = {
  id: 'anilist',
  name: 'AniList',
  async search(query: MetadataSearchQuery): Promise<MetadataSearchResult[]> {
    const data = await anilistRequest<{ Page: { media: AniListMedia[] } }>(SEARCH_QUERY, {
      search: query.title,
      perPage: 8,
    });
    return (data.Page?.media ?? []).map(toSearchResult);
  },
  async getDetails(id: string, _language: string, confidence = 0.8): Promise<EnrichedTitleMetadata | null> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;
    const data = await anilistRequest<{ Media: AniListMedia | null }>(DETAILS_QUERY, { id: numericId });
    if (!data.Media) return null;
    return toEnriched(data.Media, confidence);
  },
};
