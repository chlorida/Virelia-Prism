import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PlayerPopover = 'subtitles' | 'character-identify' | 'speed' | null;

interface PlayerPopoverContextValue {
  active: PlayerPopover;
  open: (popover: Exclude<PlayerPopover, null>) => void;
  close: () => void;
  isOpen: (popover: Exclude<PlayerPopover, null>) => boolean;
}

const PlayerPopoverContext = createContext<PlayerPopoverContextValue | null>(null);

export function PlayerPopoverProvider({
  children,
  onActiveChange,
}: {
  children: ReactNode;
  onActiveChange?: (active: PlayerPopover) => void;
}) {
  const [active, setActive] = useState<PlayerPopover>(null);

  const open = useCallback((popover: Exclude<PlayerPopover, null>) => {
    setActive(popover);
    onActiveChange?.(popover);
  }, [onActiveChange]);

  const close = useCallback(() => {
    setActive(null);
    onActiveChange?.(null);
  }, [onActiveChange]);

  const isOpen = useCallback(
    (popover: Exclude<PlayerPopover, null>) => active === popover,
    [active]
  );

  const value = useMemo(
    () => ({ active, open, close, isOpen }),
    [active, open, close, isOpen]
  );

  return (
    <PlayerPopoverContext.Provider value={value}>
      {children}
    </PlayerPopoverContext.Provider>
  );
}

export function usePlayerPopover(): PlayerPopoverContextValue {
  const ctx = useContext(PlayerPopoverContext);
  if (!ctx) {
    throw new Error('usePlayerPopover requires PlayerPopoverProvider');
  }
  return ctx;
}

export function useOptionalPlayerPopover(): PlayerPopoverContextValue | null {
  return useContext(PlayerPopoverContext);
}
