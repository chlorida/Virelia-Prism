import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

interface UseScrubRangeOptions {
  currentTime: number;
  duration: number;
  onSeek: (value: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
}

function valueFromClientX(clientX: number, element: HTMLElement, max: number): number {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || max <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return ratio * max;
}

export function useScrubRange(options: UseScrubRangeOptions) {
  const [scrub, setScrub] = useState<number | null>(null);
  const [committedSeek, setCommittedSeek] = useState<number | null>(null);
  const scrubbingRef = useRef(false);
  const scrubValueRef = useRef(0);
  const max = Math.max(options.duration, options.currentTime, 0);
  const displayValue = scrub ?? committedSeek ?? options.currentTime;
  const value = max > 0 ? Math.min(Math.max(0, displayValue), max) : 0;

  useEffect(() => {
    if (committedSeek == null) return;
    if (Math.abs(options.currentTime - committedSeek) < 0.4) {
      setCommittedSeek(null);
    }
  }, [options.currentTime, committedSeek]);

  useEffect(() => {
    if (committedSeek == null) return;
    const timer = window.setTimeout(() => setCommittedSeek(null), 2500);
    return () => window.clearTimeout(timer);
  }, [committedSeek]);

  const finishScrub = useCallback((next: number) => {
    if (!scrubbingRef.current) return;
    const clamped = max > 0 ? Math.min(Math.max(0, next), max) : 0;
    scrubbingRef.current = false;
    scrubValueRef.current = clamped;
    setScrub(null);
    setCommittedSeek(clamped);
    options.onSeek(clamped);
    options.onSeekEnd?.();
  }, [max, options]);

  const railBind = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (max <= 0) return;
      scrubbingRef.current = true;
      options.onSeekStart?.();
      const start = valueFromClientX(event.clientX, event.currentTarget, max);
      scrubValueRef.current = start;
      setScrub(start);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (!scrubbingRef.current || max <= 0) return;
      const next = valueFromClientX(event.clientX, event.currentTarget, max);
      scrubValueRef.current = next;
      setScrub(next);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (!scrubbingRef.current) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishScrub(scrubValueRef.current);
    },
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
      if (!scrubbingRef.current) return;
      finishScrub(scrubValueRef.current);
    },
  };

  const bind = {
    min: 0,
    max: max || 1,
    step: 0.1,
    value,
    onPointerDown: (event: PointerEvent<HTMLInputElement>) => {
      scrubbingRef.current = true;
      options.onSeekStart?.();
      const start = Number(event.currentTarget.value);
      scrubValueRef.current = start;
      setScrub(start);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onInput: (event: FormEvent<HTMLInputElement>) => {
      if (!scrubbingRef.current) return;
      const next = Number(event.currentTarget.value);
      scrubValueRef.current = next;
      setScrub(next);
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      if (!scrubbingRef.current) return;
      const next = Number(event.currentTarget.value);
      scrubValueRef.current = next;
      setScrub(next);
    },
    onPointerUp: (event: PointerEvent<HTMLInputElement>) => {
      if (!scrubbingRef.current) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishScrub(scrubValueRef.current);
    },
    onLostPointerCapture: (event: PointerEvent<HTMLInputElement>) => {
      if (!scrubbingRef.current) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
      finishScrub(scrubValueRef.current);
    },
    onKeyUp: (event: KeyboardEvent<HTMLInputElement>) => {
      if (!scrubbingRef.current) return;
      if (event.key === 'Enter' || event.key === ' ') {
        finishScrub(scrubValueRef.current);
      }
    },
  };

  return {
    value,
    displayTime: value,
    scrubbing: scrub !== null,
    bind,
    railBind,
  };
}
