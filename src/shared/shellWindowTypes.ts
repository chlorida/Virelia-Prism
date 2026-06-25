import type { MiniMediaKind } from './miniWindowGeometry';

export type ShellWindowMode = 'normal' | 'mini';

export type ExitMiniTarget = 'restore' | 'library';

export interface EnterMiniWindowOptions {
  isVideo?: boolean;
  /** When false, snap instantly (startup restore, reduced motion). */
  animate?: boolean;
}

export function miniKindFromOptions(options?: EnterMiniWindowOptions): MiniMediaKind {
  return options?.isVideo ? 'video' : 'audio';
}
