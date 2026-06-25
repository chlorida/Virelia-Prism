import { createStore } from '../../lib/createStore';
import { appendPlaybackHistory } from '../../lib/playbackHistory';
import { readStored, STORAGE_KEYS, writeStored } from '../../lib/storageKeys';

interface HistoryState {
  playedAtById: Record<string, string>;
  playbackHistory: string[];
}

export const historyStore = createStore<HistoryState>({
  playedAtById: readStored(STORAGE_KEYS.playedAt, {}),
  playbackHistory: readStored(STORAGE_KEYS.history, [])
});

historyStore.subscribe((state) => {
  writeStored(STORAGE_KEYS.playedAt, state.playedAtById);
  writeStored(STORAGE_KEYS.history, state.playbackHistory);
});

export function noteMediaPlayed(mediaId: string): void {
  const playedAt = new Date().toISOString();
  historyStore.setState((state) => ({
    playedAtById: { ...state.playedAtById, [mediaId]: playedAt },
    playbackHistory: appendPlaybackHistory(state.playbackHistory, mediaId)
  }));
}
