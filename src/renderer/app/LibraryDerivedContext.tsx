import { createContext, useContext, useDeferredValue, type ReactNode } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useStore } from '../lib/useStore';
import { useLibraryDerived } from '../features/library/useLibraryDerived';
import { libraryStore } from '../features/library/libraryStore';
import { searchOverlayStore } from '../features/library/searchOverlayStore';

export type LibraryDerivedValue = ReturnType<typeof useLibraryDerived>;

const LibraryDerivedContext = createContext<LibraryDerivedValue | null>(null);

export function LibraryDerivedProvider(props: { children: ReactNode }) {
  const query = useStore(libraryStore, (state) => state.query);
  const overlayOpen = useStore(searchOverlayStore, (state) => state.open);
  const pageQuery = overlayOpen ? '' : query;
  const debouncedQuery = useDebouncedValue(pageQuery, 280);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const derived = useLibraryDerived(debouncedQuery, deferredQuery);

  return (
    <LibraryDerivedContext.Provider value={derived}>
      {props.children}
    </LibraryDerivedContext.Provider>
  );
}

export function useLibraryDerivedContext(): LibraryDerivedValue {
  const ctx = useContext(LibraryDerivedContext);
  if (!ctx) throw new Error('useLibraryDerivedContext must be used within LibraryDerivedProvider');
  return ctx;
}
