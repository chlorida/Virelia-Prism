import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { PrismStore } from './createStore';

function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (!Object.is(left[i], right[i])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left as object);
  const rightKeys = Object.keys(right as object);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

export function useStore<T, S>(store: PrismStore<T>, selector: (state: T) => S): S {
  const selectorRef = useRef(selector);
  const snapshotRef = useRef<S | undefined>(undefined);
  selectorRef.current = selector;

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(() => onStoreChange()),
    [store],
  );

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.getState());
    const prev = snapshotRef.current;
    if (prev !== undefined && shallowEqual(prev, next)) {
      return prev;
    }
    snapshotRef.current = next;
    return next;
  }, [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useStoreState<T>(store: PrismStore<T>): T {
  return useStore(store, (state) => state);
}
