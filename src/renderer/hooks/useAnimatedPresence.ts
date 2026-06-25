import { useCallback, useEffect, useRef, useState } from 'react';

export type AnimatedPresencePhase = 'enter' | 'exit' | 'idle';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface UseAnimatedPresenceOptions {
  visible: boolean;
  exitDurationMs?: number;
}

interface UseAnimatedPresenceResult {
  shouldRender: boolean;
  phase: AnimatedPresencePhase;
  onAnimationEnd: (event: React.AnimationEvent) => void;
}

export function useAnimatedPresence(options: UseAnimatedPresenceOptions): UseAnimatedPresenceResult {
  const { visible, exitDurationMs = 220 } = options;
  const [shouldRender, setShouldRender] = useState(visible);
  const [phase, setPhase] = useState<AnimatedPresencePhase>(visible ? 'enter' : 'idle');
  const exitTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      if (exitTimerRef.current !== undefined) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = undefined;
      }
      setShouldRender(true);
      setPhase(prefersReducedMotion() ? 'idle' : 'enter');
      return;
    }

    if (!shouldRender) return;

    if (prefersReducedMotion()) {
      setShouldRender(false);
      setPhase('idle');
      return;
    }

    setPhase('exit');
    exitTimerRef.current = window.setTimeout(() => {
      setShouldRender(false);
      setPhase('idle');
      exitTimerRef.current = undefined;
    }, exitDurationMs);
  }, [visible, shouldRender, exitDurationMs]);

  useEffect(() => () => {
    if (exitTimerRef.current !== undefined) {
      window.clearTimeout(exitTimerRef.current);
    }
  }, []);

  const onAnimationEnd = useCallback((event: React.AnimationEvent) => {
    if (event.target !== event.currentTarget) return;
    if (phase === 'enter') {
      setPhase('idle');
    }
  }, [phase]);

  return { shouldRender, phase, onAnimationEnd };
}
