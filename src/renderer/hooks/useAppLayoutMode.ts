import { useEffect, useState } from 'react';

/** Wide: docked queue column. Medium: drawer. Narrow: drawer + sidebar drawer. */
export const LAYOUT_BREAKPOINTS = {
  wideMin: 1450,
  mediumMin: 1100
} as const;

export type AppLayoutMode = 'wide' | 'medium' | 'narrow';

export function resolveAppLayoutMode(width: number): AppLayoutMode {
  if (width >= LAYOUT_BREAKPOINTS.wideMin) return 'wide';
  if (width >= LAYOUT_BREAKPOINTS.mediumMin) return 'medium';
  return 'narrow';
}

export function useAppLayoutMode(): AppLayoutMode {
  const [mode, setMode] = useState<AppLayoutMode>(() => (
    typeof window !== 'undefined' ? resolveAppLayoutMode(window.innerWidth) : 'wide'
  ));

  useEffect(() => {
    const onResize = () => setMode(resolveAppLayoutMode(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return mode;
}
