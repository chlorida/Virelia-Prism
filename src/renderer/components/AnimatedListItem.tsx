import { useEffect, useState, type AnimationEvent, type ReactNode } from 'react';
import { MOTION_LIST_EXIT_MS } from '../lib/motionCatalog';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface AnimatedListItemProps {
  itemKey: string;
  className?: string;
  /** When false, plays exit animation then calls onExitComplete. Default true. */
  present?: boolean;
  exitDurationMs?: number;
  onExitComplete?: () => void;
  children: ReactNode;
}

export function AnimatedListItem(props: AnimatedListItemProps) {
  const present = props.present ?? true;
  const exitDurationMs = props.exitDurationMs ?? MOTION_LIST_EXIT_MS;
  const [shouldRender, setShouldRender] = useState(present);
  const [phase, setPhase] = useState<'enter' | 'idle' | 'exit'>(present ? 'enter' : 'exit');

  useEffect(() => {
    if (present) {
      setShouldRender(true);
      setPhase(prefersReducedMotion() ? 'idle' : 'enter');
      return;
    }

    if (!shouldRender) return;

    if (prefersReducedMotion()) {
      setShouldRender(false);
      setPhase('idle');
      props.onExitComplete?.();
      return;
    }

    setPhase('exit');
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setPhase('idle');
      props.onExitComplete?.();
    }, exitDurationMs);

    return () => window.clearTimeout(timer);
  }, [present, props.itemKey, exitDurationMs, shouldRender, props.onExitComplete]);

  if (!shouldRender) return null;

  const phaseClass = phase === 'enter'
    ? 'prism-motion-list-enter'
    : phase === 'exit'
      ? 'prism-motion-list-exit'
      : '';

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (phase === 'enter') setPhase('idle');
  }

  return (
    <div
      className={['prism-motion-list-host', phaseClass, props.className].filter(Boolean).join(' ')}
      onAnimationEnd={handleAnimationEnd}
    >
      {props.children}
    </div>
  );
}
