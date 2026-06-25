/** Shared motion timing constants — keep in sync with motion.css tokens. */

export const MOTION_DURATION_MICRO = 120;
export const MOTION_DURATION_FAST = 180;
export const MOTION_DURATION_BASE = 280;
export const MOTION_DURATION_SLOW = 420;

export const MOTION_EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const MOTION_EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
export const MOTION_EASE_SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)';

export const MOTION_LIST_EXIT_MS = MOTION_DURATION_FAST;
export const MOTION_PANEL_TOGGLE_MS = MOTION_DURATION_BASE;
export const MOTION_MINI_LEAVE_MS = MOTION_DURATION_FAST + 40;
export const MOTION_MINI_ENTER_MS = MOTION_DURATION_BASE + 40;

export const motionCatalog = {
  durationMicro: MOTION_DURATION_MICRO,
  durationFast: MOTION_DURATION_FAST,
  durationBase: MOTION_DURATION_BASE,
  durationSlow: MOTION_DURATION_SLOW,
  easeOut: MOTION_EASE_OUT,
  easeIn: MOTION_EASE_IN,
  easeSpring: MOTION_EASE_SPRING,
  listExitMs: MOTION_LIST_EXIT_MS,
  panelToggleMs: MOTION_PANEL_TOGGLE_MS,
  miniLeaveMs: MOTION_MINI_LEAVE_MS,
  miniEnterMs: MOTION_MINI_ENTER_MS,
} as const;
