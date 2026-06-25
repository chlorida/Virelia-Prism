import type { AppLayoutMode } from '../../hooks/useAppLayoutMode';
import { LAYOUT_BREAKPOINTS } from '../../hooks/useAppLayoutMode';

export { LAYOUT_BREAKPOINTS };

/** Wide window: queue is a docked right column. */
export function isQueueDocked(layoutMode: AppLayoutMode): boolean {
  return layoutMode === 'wide';
}

/** Medium/narrow: queue is an overlay drawer toggled by the Queue button. */
export function isQueueDrawerMode(layoutMode: AppLayoutMode): boolean {
  return !isQueueDocked(layoutMode);
}
