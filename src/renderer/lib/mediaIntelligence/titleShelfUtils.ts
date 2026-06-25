import type { LibraryTitle } from './types';
import { getTitleProgressSummary } from './titlePlaybackService';

/** Title with in-progress playback — for the compact continue strip only. */
export function pickContinueTitle(titles: LibraryTitle[]): LibraryTitle | undefined {
  return titles.find((title) => getTitleProgressSummary(title).hasProgress);
}

/** @deprecated Use pickContinueTitle for browse UI; kept for legacy table. */
export function pickFeaturedTitle(titles: LibraryTitle[]): LibraryTitle | undefined {
  if (titles.length === 0) return undefined;
  return pickContinueTitle(titles) ?? titles[0];
}
