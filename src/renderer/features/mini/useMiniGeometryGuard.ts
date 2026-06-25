import { useEffect, useRef } from 'react';
import { getExpectedMiniDimensions, type MiniMediaKind } from '../../../shared/miniWindowGeometry';

const SIZE_TOLERANCE = 64;

/**
 * Warn once if the native window is much larger than the compact mini card (shell resize lag).
 */
export function useMiniGeometryGuard(kind: MiniMediaKind): void {
  const warnedRef = useRef(false);

  useEffect(() => {
    warnedRef.current = false;
    const expected = getExpectedMiniDimensions(kind);

    const check = () => {
      if (warnedRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w > expected.width + SIZE_TOLERANCE || h > expected.height + SIZE_TOLERANCE) {
        warnedRef.current = true;
        console.warn(
          `[Virelia] Mini window geometry mismatch: expected ~${expected.width}x${expected.height}, got ${w}x${h}. UI stays compact; re-applying shell bounds.`
        );
      }
    };

    check();
    const id = window.setInterval(check, 250);
    return () => window.clearInterval(id);
  }, [kind]);
}
