import { getOrInferCharacterColor } from '../../lib/tauriCommands';
import type { ParsedCue } from './vttParser';

const SPEAKER_PREFIX_RE = /^([A-Za-zА-Яа-яЁё][\wА-Яа-яЁё\-']{0,30})\s*:\s*/u;

export type SpeakerColorsMode = 'off' | 'auto' | 'franchise';

export interface SubtitleColorContext {
  videoKey: string;
  videoPath?: string;
  franchiseKey?: string;
  speakerColorsMode: SpeakerColorsMode;
}

export function extractSpeakerPrefix(text: string): { speaker: string } | null {
  const match = text.trim().match(SPEAKER_PREFIX_RE);
  if (!match?.[1]) return null;
  return { speaker: match[1].trim() };
}

export function resolveCueSpeaker(cue: ParsedCue): string | undefined {
  if (cue.speaker?.trim()) return cue.speaker.trim();
  return extractSpeakerPrefix(cue.text)?.speaker;
}

async function resolveSpeakerColors(
  speaker: string,
  cache: Map<string, { color: string; outlineColor: string }>,
  context: SubtitleColorContext
): Promise<{ color: string; outlineColor: string } | null> {
  const key = speaker.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const result = await getOrInferCharacterColor({
      franchiseKey: context.franchiseKey,
      videoKey: context.videoKey,
      videoPath: context.videoPath,
      characterName: speaker,
      speakerId: speaker,
    });
    const entry = {
      color: result.color,
      outlineColor: result.outlineColor ?? '#000000',
    };
    cache.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export async function enrichCuesWithSpeakerColors(
  cues: ParsedCue[],
  context?: SubtitleColorContext
): Promise<ParsedCue[]> {
  if (!context || context.speakerColorsMode === 'off' || cues.length === 0) {
    return cues;
  }

  const speakers = new Set<string>();
  for (const cue of cues) {
    const speaker = resolveCueSpeaker(cue);
    if (speaker && !cue.color) speakers.add(speaker);
  }
  if (speakers.size === 0) return cues;

  const cache = new Map<string, { color: string; outlineColor: string }>();
  await Promise.all(
    [...speakers].map(async (speaker) => {
      await resolveSpeakerColors(speaker, cache, context);
    })
  );

  return cues.map((cue) => {
    if (cue.color) return cue;
    const speaker = resolveCueSpeaker(cue);
    if (!speaker) return cue;
    const colors = cache.get(speaker.toLowerCase());
    if (!colors) return { ...cue, speaker };
    return {
      ...cue,
      speaker,
      color: colors.color,
      outlineColor: colors.outlineColor,
    };
  });
}
