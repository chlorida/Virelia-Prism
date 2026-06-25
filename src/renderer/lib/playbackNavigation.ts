import type { MediaItem, QueueItem, RepeatMode } from '../../shared/types';

export interface PlaybackNavOptions {
  repeat: RepeatMode;
  shuffle: boolean;
}

const defaultNavOptions: PlaybackNavOptions = { repeat: 'off', shuffle: false };

const shuffleHistory: string[] = [];

export function clearShuffleHistory(): void {
  shuffleHistory.length = 0;
}

export function noteShufflePlay(mediaId: string): void {
  const index = shuffleHistory.indexOf(mediaId);
  if (index >= 0) shuffleHistory.splice(index, 1);
  shuffleHistory.push(mediaId);
}

export function resolveQueueMedia(queue: QueueItem[], media: MediaItem[]): MediaItem[] {
  return queue
    .map((entry) => media.find((item) => item.id === entry.mediaId))
    .filter((item): item is MediaItem => Boolean(item));
}

/** Playback order: pinned queue, then queue, then library list (deduped). */
export function buildPlaybackSequence(queue: QueueItem[], libraryList: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const sequence: MediaItem[] = [];

  const pinned = queue.filter((entry) => entry.pinned);
  const unpinned = queue.filter((entry) => !entry.pinned);

  for (const item of resolveQueueMedia([...pinned, ...unpinned], libraryList)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    sequence.push(item);
  }

  for (const item of libraryList) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    sequence.push(item);
  }

  return sequence;
}

function pickShuffleTrack(sequence: MediaItem[], current?: MediaItem): MediaItem | undefined {
  const pool = current ? sequence.filter((item) => item.id !== current.id) : sequence;
  if (pool.length === 0) return undefined;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function findNextTrack(
  sequence: MediaItem[],
  current?: MediaItem,
  options: PlaybackNavOptions = defaultNavOptions
): MediaItem | undefined {
  if (sequence.length === 0) return undefined;
  if (options.repeat === 'one' && current) return current;

  if (options.shuffle) {
    const pick = pickShuffleTrack(sequence, current);
    if (pick) return pick;
    if (options.repeat === 'all') return sequence[0];
    return undefined;
  }

  if (!current) return sequence[0];
  const index = sequence.findIndex((item) => item.id === current.id);
  if (index < 0) return sequence[0];
  if (index + 1 < sequence.length) return sequence[index + 1];
  if (options.repeat === 'all') return sequence[0];
  return undefined;
}

export function findPreviousTrack(
  sequence: MediaItem[],
  current?: MediaItem,
  options: PlaybackNavOptions = defaultNavOptions
): MediaItem | undefined {
  if (sequence.length === 0) return undefined;
  if (options.repeat === 'one' && current) return current;

  if (options.shuffle && current) {
    if (shuffleHistory.length >= 2) {
      const previousId = shuffleHistory[shuffleHistory.length - 2];
      const previous = sequence.find((item) => item.id === previousId);
      if (previous) return previous;
    }
    if (options.repeat === 'all') return sequence[sequence.length - 1];
    return undefined;
  }

  if (!current) return undefined;
  const index = sequence.findIndex((item) => item.id === current.id);
  if (index <= 0) {
    if (options.repeat === 'all') return sequence[sequence.length - 1];
    return undefined;
  }
  return sequence[index - 1];
}

export function reorderQueueItems(queue: QueueItem[], fromIndex: number, toIndex: number): QueueItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return queue;
  const next = [...queue];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return queue;
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderQueueById(queue: QueueItem[], fromQueueId: string, toQueueId: string): QueueItem[] {
  const fromIndex = queue.findIndex((item) => item.id === fromQueueId);
  const toIndex = queue.findIndex((item) => item.id === toQueueId);
  if (fromIndex < 0 || toIndex < 0) return queue;
  return reorderQueueItems(queue, fromIndex, toIndex);
}
