import type { WindowBounds } from './miniWindowGeometry';

/** Duration for morphing window x/y/width/height into mini corner. */
export const WINDOW_BOUNDS_ANIM_MS = 400;

/**
 * Native bounds cadence for Electron main process (no rAF in Node).
 * Tauri uses renderer-side animateTauriWindowBounds at display refresh rate instead.
 */
export const WINDOW_BOUNDS_TARGET_FPS = 30;

export const WINDOW_BOUNDS_FRAME_MS = 1000 / WINDOW_BOUNDS_TARGET_FPS;

export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) ** 3;
}

export function lerpBounds(from: WindowBounds, to: WindowBounds, t: number): WindowBounds {
  return {
    x: Math.round(from.x + (to.x - from.x) * t),
    y: Math.round(from.y + (to.y - from.y) * t),
    width: Math.round(from.width + (to.width - from.width) * t),
    height: Math.round(from.height + (to.height - from.height) * t),
  };
}

export function boundsNearlyEqual(a: WindowBounds, b: WindowBounds, tolerance = 2): boolean {
  return Math.abs(a.x - b.x) <= tolerance
    && Math.abs(a.y - b.y) <= tolerance
    && Math.abs(a.width - b.width) <= tolerance
    && Math.abs(a.height - b.height) <= tolerance;
}

function boundsEqual(a: WindowBounds, b: WindowBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export type SetWindowBoundsFn = (bounds: WindowBounds) => void | Promise<void>;

export interface AnimateWindowBoundsOptions {
  durationMs?: number;
  instant?: boolean;
  targetFps?: number;
  /** Test hook — forces sequential frame stepping. */
  waitNextFrame?: () => Promise<void>;
}

const defaultWaitNextFrame = () => new Promise<void>((resolve) => {
  setTimeout(resolve, WINDOW_BOUNDS_FRAME_MS);
});

/**
 * Smoothly morphs native window bounds (position + size) between two rectangles.
 * Coalesces overlapping setBounds calls — only one native resize in flight at a time.
 */
export async function animateWindowBounds(
  from: WindowBounds,
  to: WindowBounds,
  setBounds: SetWindowBoundsFn,
  options: AnimateWindowBoundsOptions = {}
): Promise<void> {
  const durationMs = options.durationMs ?? WINDOW_BOUNDS_ANIM_MS;
  const instant = options.instant ?? false;
  const waitNextFrame = options.waitNextFrame;
  const targetFps = Math.min(Math.max(options.targetFps ?? WINDOW_BOUNDS_TARGET_FPS, 24), 60);
  const frameMs = 1000 / targetFps;

  if (instant || durationMs <= 0 || boundsNearlyEqual(from, to)) {
    await setBounds(to);
    return;
  }

  if (waitNextFrame) {
    const start = Date.now();
    let lastT = 0;
    while (lastT < 1) {
      await waitNextFrame();
      const elapsed = Date.now() - start;
      lastT = Math.min(1, elapsed / durationMs);
      await setBounds(lerpBounds(from, to, easeOutCubic(lastT)));
    }
    await setBounds(to);
    return;
  }

  await new Promise<void>((resolve) => {
    const start = performance.now();
    let settled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let inFlight = false;
    let queued: WindowBounds | null = null;
    let lastApplied: WindowBounds | null = null;

    const flush = () => {
      if (!queued || inFlight) return;
      const target = queued;
      queued = null;
      if (lastApplied && boundsEqual(lastApplied, target)) return;

      inFlight = true;
      void Promise.resolve(setBounds(target))
        .catch(() => undefined)
        .finally(() => {
          lastApplied = target;
          inFlight = false;
          if (queued) flush();
        });
    };

    const queueBounds = (bounds: WindowBounds) => {
      queued = bounds;
      flush();
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
      void Promise.resolve(setBounds(to)).then(() => resolve());
    };

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      queueBounds(lerpBounds(from, to, easeOutCubic(t)));
      if (t >= 1) finish();
    };

    queueBounds(lerpBounds(from, to, 0));
    intervalId = setInterval(() => step(performance.now()), frameMs);
    step(start);

    setTimeout(finish, durationMs + frameMs * 3);
  });
}
