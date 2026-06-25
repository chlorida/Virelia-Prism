/** Shared poster-card grid sizing for the Titles shelf. */
export const CARD_GAP = 14;
export const CARD_MIN_W = 170;
export const CARD_PREF_W = 200;
export const CARD_MAX_W = 210;
/** Poster height / width (2:3). */
export const TITLE_CARD_ASPECT = 3 / 2;
export const TITLE_CARD_COMPACT_HEIGHT = 124;

export interface PosterGridLayout {
  columns: number;
  cardWidth: number;
  rowHeight: number;
}

export function computePosterGridLayout(containerWidth: number, compact: boolean): PosterGridLayout {
  if (compact) {
    return {
      columns: 1,
      cardWidth: containerWidth,
      rowHeight: TITLE_CARD_COMPACT_HEIGHT + CARD_GAP,
    };
  }

  const width = Math.max(0, containerWidth);
  if (width < CARD_MIN_W * 2 + CARD_GAP) {
    const cardWidth = Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, width));
    return {
      columns: 1,
      cardWidth,
      rowHeight: Math.ceil(cardWidth * TITLE_CARD_ASPECT) + CARD_GAP,
    };
  }

  const maxCols = Math.floor((width + CARD_GAP) / (CARD_PREF_W + CARD_GAP));
  const columns = Math.max(2, Math.min(6, maxCols));
  const rawWidth = (width - CARD_GAP * (columns - 1)) / columns;
  const cardWidth = Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, Math.floor(rawWidth)));
  const rowHeight = Math.ceil(cardWidth * TITLE_CARD_ASPECT) + CARD_GAP;

  return { columns, cardWidth, rowHeight };
}
