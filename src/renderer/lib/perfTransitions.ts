import { isPerfEnabled, perfLog, perfMark, perfMeasure } from './perf';

const GROUP = 'Virelia Perf · transitions';

type TransitionKind =
  | 'watch-enter'
  | 'watch-exit'
  | 'player-open'
  | 'player-close'
  | 'mini-enter'
  | 'mini-exit'
  | 'theater-enter'
  | 'theater-exit'
  | 'list-item-enter'
  | 'panel-toggle';

function markStart(kind: TransitionKind): string {
  const start = `${kind}:start`;
  perfMark(start);
  if (isPerfEnabled()) perfLog(`${GROUP} → ${kind} started`);
  return start;
}

function markEnd(kind: TransitionKind, startMark: string): void {
  perfMeasure(kind, startMark, `${kind}:end`);
  perfMark(`${kind}:end`);
  if (isPerfEnabled()) perfLog(`${GROUP} ✓ ${kind}`);
}

export const perfTransitions = {
  watchEnterStart: () => markStart('watch-enter'),
  watchEnterEnd: (start: string) => markEnd('watch-enter', start),
  watchExitStart: () => markStart('watch-exit'),
  watchExitEnd: (start: string) => markEnd('watch-exit', start),
  playerOpenStart: () => markStart('player-open'),
  playerOpenEnd: (start: string) => markEnd('player-open', start),
  playerCloseStart: () => markStart('player-close'),
  playerCloseEnd: (start: string) => markEnd('player-close', start),
  miniEnterStart: () => markStart('mini-enter'),
  miniEnterEnd: (start: string) => markEnd('mini-enter', start),
  miniExitStart: () => markStart('mini-exit'),
  miniExitEnd: (start: string) => markEnd('mini-exit', start),
  theaterEnterStart: () => markStart('theater-enter'),
  theaterEnterEnd: (start: string) => markEnd('theater-enter', start),
  theaterExitStart: () => markStart('theater-exit'),
  theaterExitEnd: (start: string) => markEnd('theater-exit', start),
  listItemEnterStart: () => markStart('list-item-enter'),
  listItemEnterEnd: (start: string) => markEnd('list-item-enter', start),
  panelToggleStart: () => markStart('panel-toggle'),
  panelToggleEnd: (start: string) => markEnd('panel-toggle', start),
};
