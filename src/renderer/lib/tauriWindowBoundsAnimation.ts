import type { WindowBounds } from '../../shared/miniWindowGeometry';
import {
  WINDOW_BOUNDS_ANIM_MS,
  boundsNearlyEqual,
  easeOutCubic,
  lerpBounds,
} from '../../shared/windowBoundsAnimation';

type TauriWindow = import('@tauri-apps/api/window').Window;

function boundsEqual(a: WindowBounds, b: WindowBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Tauri mini morph — runs in the WebView at display refresh rate (rAF).
 * Size and position IPC calls are fired in parallel without awaiting each frame.
 */
export async function animateTauriWindowBounds(
  win: TauriWindow,
  from: WindowBounds,
  to: WindowBounds,
  options?: { instant?: boolean; durationMs?: number }
): Promise<void> {
  const instant = options?.instant ?? false;
  const durationMs = options?.durationMs ?? WINDOW_BOUNDS_ANIM_MS;
  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');

  const applyFinal = async (bounds: WindowBounds) => {
    await win.setSize(new LogicalSize(bounds.width, bounds.height));
    await win.setPosition(new LogicalPosition(bounds.x, bounds.y));
  };

  if (instant || durationMs <= 0 || boundsNearlyEqual(from, to)) {
    await applyFinal(to);
    return;
  }

  await new Promise<void>((resolve) => {
    const start = performance.now();
    let lastApplied: WindowBounds | null = null;
    let frameId = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(frameId);
      void applyFinal(to).then(() => resolve());
    };

    const push = (bounds: WindowBounds) => {
      if (lastApplied && boundsEqual(lastApplied, bounds)) return;
      lastApplied = bounds;
      void win.setSize(new LogicalSize(bounds.width, bounds.height));
      void win.setPosition(new LogicalPosition(bounds.x, bounds.y));
    };

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      push(lerpBounds(from, to, easeOutCubic(t)));
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };

    push(lerpBounds(from, to, 0));
    frameId = requestAnimationFrame(tick);
    setTimeout(finish, durationMs + 48);
  });
}
