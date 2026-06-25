import type { MediaFilter, MediaItem, SortMode } from '../../../shared/types';
import type { LibraryCounts } from '../../lib/libraryStats';
import type { LibraryBootState } from './libraryBootState';

export interface LibraryState {
  loading: boolean;
  boot: LibraryBootState;
  /** When true, sidebar shows — instead of 0 until counts are known. */
  countsPending: boolean;
  bootError: string | null;
  /** Background rescan / validation without blocking the shell. */
  scanning: boolean;
  scanError: string | null;
  scanProgress: { scanned: number; added: number } | null;
  lastScanProgressAt: number | null;
  media: MediaItem[];
  audioMedia: MediaItem[];
  videoMedia: MediaItem[];
  filter: MediaFilter;
  sort: SortMode;
  query: string;
  durationById: Record<string, number>;
  mediaDurationSorted: MediaItem[];
  focusedRowId?: string;
  selectedTitleId?: string;
  selectedFranchiseId?: string;
  /** Persisted counts from disk snapshot — kept during background scan. */
  snapshotCounts: LibraryCounts | null;
}

export const initialLibraryState: LibraryState = {
  loading: false,
  boot: 'idle',
  countsPending: false,
  bootError: null,
  scanning: false,
  scanError: null,
  scanProgress: null,
  lastScanProgressAt: null,
  media: [],
  audioMedia: [],
  videoMedia: [],
  filter: 'all',
  sort: 'alphabetical',
  query: '',
  durationById: {},
  mediaDurationSorted: [],
  snapshotCounts: null
};
