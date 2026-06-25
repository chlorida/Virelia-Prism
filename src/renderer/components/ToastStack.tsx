import { useCallback, useEffect, useRef, useState } from 'react';

import { upsertToastMessage } from './toastDedupe';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';

export interface ToastMessage {
  id: string;
  text: string;
  dedupeKey?: string;
}

export interface ToastOptions {
  durationMs?: number;
  key?: string;
}

interface ToastStackProps {
  messages: ToastMessage[];
  exitingIds: ReadonlySet<string>;
}

function ToastItem(props: { message: ToastMessage; exiting: boolean }) {
  const { shouldRender, phase, onAnimationEnd } = useAnimatedPresence({
    visible: !props.exiting,
    exitDurationMs: 280,
  });

  if (!shouldRender) return null;

  const animClass = phase === 'enter'
    ? 'prism-animate-toast--enter'
    : phase === 'exit'
      ? 'prism-animate-toast--exit'
      : '';

  return (
    <div
      className={['toast-item', animClass].filter(Boolean).join(' ')}
      onAnimationEnd={onAnimationEnd}
    >
      {props.message.text}
    </div>
  );
}

export function ToastStack(props: ToastStackProps) {
  return (
    <div className="toast-stack" aria-live="polite">
      {props.messages.map((message) => (
        <ToastItem
          key={message.id}
          message={message}
          exiting={props.exitingIds.has(message.id)}
        />
      ))}
    </div>
  );
}

type ToastEntry = ToastMessage & { expiresAt: number };

const DEFAULT_DURATION_MS = 3000;
const TOAST_EXIT_MS = 280;

export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const entriesRef = useRef<Map<string, ToastEntry>>(new Map());
  const timersRef = useRef<Map<string, number>>(new Map());
  const exitTimersRef = useRef<Map<string, number>>(new Map());

  const finalizeRemove = useCallback((id: string) => {
    entriesRef.current.delete(id);
    setMessages((items) => items.filter((item) => item.id !== id));
    setExitingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setExitingIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      const exitTimer = window.setTimeout(() => finalizeRemove(id), TOAST_EXIT_MS);
      exitTimersRef.current.set(id, exitTimer);
      return next;
    });
  }, [finalizeRemove]);

  const scheduleExpiry = useCallback((id: string, durationMs: number) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) window.clearTimeout(existing);

    const timer = window.setTimeout(() => removeToast(id), durationMs);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  const showToast = useCallback((text: string, options?: number | ToastOptions) => {
    const opts: ToastOptions = typeof options === 'number' ? { durationMs: options } : (options ?? {});
    const durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
    const dedupeKey = opts.key;
    const stableId = dedupeKey ? `toast-key-${dedupeKey}` : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setExitingIds((prev) => {
      if (!prev.has(stableId)) return prev;
      const next = new Set(prev);
      next.delete(stableId);
      return next;
    });

    setMessages((items) => {
      const withoutDupes = dedupeKey
        ? items.filter((item) => item.dedupeKey !== dedupeKey && item.id !== stableId)
        : items;
      return [...withoutDupes, { id: stableId, text, dedupeKey }];
    });

    entriesRef.current.set(stableId, {
      id: stableId,
      text,
      dedupeKey,
      expiresAt: Date.now() + durationMs,
    });
    scheduleExpiry(stableId, durationMs);
  }, [scheduleExpiry]);

  const clearToasts = useCallback(() => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    for (const timer of exitTimersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
    exitTimersRef.current.clear();
    entriesRef.current.clear();
    setMessages([]);
    setExitingIds(new Set());
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer);
      for (const timer of exitTimersRef.current.values()) window.clearTimeout(timer);
      timersRef.current.clear();
      exitTimersRef.current.clear();
      entriesRef.current.clear();
    };
  }, []);

  return { messages, exitingIds, showToast, clearToasts };
}

export { upsertToastMessage };
