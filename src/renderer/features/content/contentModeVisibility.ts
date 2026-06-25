import type { PrismRoute } from '../library/libraryRouterTypes';
import type { PlayerMode } from '../ui/playerModeTypes';

export function shouldShowContentModeSwitch(
  route: PrismRoute,
  playerMode: PlayerMode,
): boolean {
  if (playerMode !== 'library') return false;
  return route.page === 'home' || route.page === 'files';
}
