import { useEffect, useState } from 'react';

export const PLAYER_SHEET_ANIM_MS = 460;

export function usePlayerSheetPortal(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<'open' | 'closing' | 'closed'>(open ? 'open' : 'closed');

  useEffect(() => {
    if (open) {
      setMounted(true);
      setPhase('closed');
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setPhase('open'));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    if (!mounted) return undefined;

    setPhase('closing');
    const timer = window.setTimeout(() => {
      setMounted(false);
      setPhase('closed');
    }, PLAYER_SHEET_ANIM_MS);

    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  const sheetPhaseClass =
    phase === 'open' ? 'is-open' : phase === 'closing' ? 'is-closing' : '';

  return { mounted, sheetPhaseClass };
}
