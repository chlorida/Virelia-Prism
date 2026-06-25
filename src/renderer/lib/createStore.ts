export type StoreListener<T> = (state: T) => void;

export interface PrismStore<T> {
  getState: () => T;
  setState: (next: T | ((previous: T) => T)) => void;
  patch: (partial: Partial<T>) => void;
  subscribe: (listener: StoreListener<T>) => () => void;
}

export function createStore<T>(initial: T): PrismStore<T> {
  let state = initial;
  const listeners = new Set<StoreListener<T>>();

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    getState: () => state,
    setState: (next) => {
      const previous = state;
      state = typeof next === 'function' ? (next as (previous: T) => T)(state) : next;
      if (!Object.is(previous, state)) notify();
    },
    patch: (partial) => {
      const previous = state;
      state = { ...state, ...partial };
      if (!Object.is(previous, state)) notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }
  };
}
