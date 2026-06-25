import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_ROTATE_X = 4;
const MAX_ROTATE_Y = 5;

export function useCardTilt(enabled: boolean) {
  const frameRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const active = enabled && !reducedMotion;

  const applyTilt = useCallback((nx: number, ny: number) => {
    const el = frameRef.current;
    if (!el) return;
    const clampedX = Math.max(-1, Math.min(1, nx));
    const clampedY = Math.max(-1, Math.min(1, ny));
    el.style.setProperty('--tilt-x', `${-clampedY * MAX_ROTATE_X}deg`);
    el.style.setProperty('--tilt-y', `${clampedX * MAX_ROTATE_Y}deg`);
    el.style.setProperty('--parallax-x', `${clampedX * 4}px`);
    el.style.setProperty('--parallax-y', `${clampedY * 4}px`);
    el.style.setProperty('--glare-x', `${50 + clampedX * 32}%`);
    el.style.setProperty('--glare-y', `${50 + clampedY * 32}%`);
    el.style.setProperty('--glare-opacity', '0.85');
    el.classList.add('is-tilted');
  }, []);

  const resetTilt = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    el.classList.remove('is-tilted');
    el.style.removeProperty('--tilt-x');
    el.style.removeProperty('--tilt-y');
    el.style.removeProperty('--parallax-x');
    el.style.removeProperty('--parallax-y');
    el.style.removeProperty('--glare-x');
    el.style.removeProperty('--glare-y');
    el.style.removeProperty('--glare-opacity');
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!active) return;
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pendingRef.current = { x: nx, y: ny };
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingRef.current;
      if (pending) applyTilt(pending.x, pending.y);
    });
  }, [active, applyTilt]);

  const onPointerLeave = useCallback(() => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = null;
    resetTilt();
  }, [resetTilt]);

  useEffect(() => () => {
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
  }, []);

  return { frameRef, onPointerMove, onPointerLeave, tiltActive: active };
}
