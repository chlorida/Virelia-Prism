import { useCallback, useEffect, useRef } from 'react';
import { usePlaybackActions } from './usePlayback';

export type PreviewHostOwner = 'player' | 'mini';

/**
 * Attaches the single shared media element to a visible host while `active`.
 * Detaches back to the engine sink when inactive or on unmount.
 */
export function useManagedPreviewHost(owner: PreviewHostOwner, active: boolean) {
  const { actions } = usePlaybackActions();
  const attachRef = useRef(actions.attachPreviewHost);
  attachRef.current = actions.attachPreviewHost;
  const hostNodeRef = useRef<HTMLElement | null>(null);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;

  const syncHost = useCallback(() => {
    if (!active) {
      attachRef.current(null);
      return;
    }
    if (hostNodeRef.current) {
      attachRef.current(hostNodeRef.current);
    }
  }, [active]);

  useEffect(() => {
    syncHost();
    return () => {
      attachRef.current(null);
    };
  }, [syncHost]);

  return useCallback((node: HTMLElement | null) => {
    hostNodeRef.current = node;
    if (!active || !node) return;
    attachRef.current(node);
  }, [active]);
}
