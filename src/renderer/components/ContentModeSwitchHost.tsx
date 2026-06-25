import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { ContentModeRail } from './ContentModeSwitch';
import type { ContentMode } from '../features/content/contentModeTypes';

const PLACEMENT_MS = 360;
const PLACEMENT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

interface ContentModeSwitchHostProps {
  titleBarRef: RefObject<HTMLElement | null>;
  brandAnchorRef: RefObject<HTMLElement | null>;
  mode: ContentMode;
  wide: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearInlinePlacement(host: HTMLDivElement): void {
  host.style.left = '';
  host.style.right = '';
  host.style.top = '';
  host.style.bottom = '';
  host.style.margin = '';
  host.style.width = '';
  host.style.height = '';
  host.style.transform = '';
}

export function ContentModeSwitchHost(props: ContentModeSwitchHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef({ left: 0, top: 0 });
  const wideRef = useRef(props.wide);
  const [isPlaced, setIsPlaced] = useState(false);

  const measureCompactPlacement = useCallback(() => {
    const bar = props.titleBarRef.current;
    const anchor = props.brandAnchorRef.current;
    const host = hostRef.current;
    if (!bar || !anchor || !host) return null;

    const barRect = bar.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const hostHeight = host.getBoundingClientRect().height || host.offsetHeight || 36;

    return {
      left: anchorRect.left - barRect.left,
      top: anchorRect.top - barRect.top + (anchorRect.height - hostHeight) / 2,
    };
  }, [props.brandAnchorRef, props.titleBarRef]);

  const applyPlacement = useCallback((animate: boolean) => {
    const host = hostRef.current;
    if (!host) return false;

    host.style.transition = animate && !prefersReducedMotion()
      ? `left ${PLACEMENT_MS}ms ${PLACEMENT_EASE}, top ${PLACEMENT_MS}ms ${PLACEMENT_EASE}, transform ${PLACEMENT_MS}ms ${PLACEMENT_EASE}`
      : 'none';

    if (props.wide) {
      clearInlinePlacement(host);
      setIsPlaced(true);
      return true;
    }

    const next = measureCompactPlacement();
    if (!next) return false;

    placementRef.current = next;
    host.style.left = `${next.left}px`;
    host.style.top = `${next.top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.margin = '0';
    host.style.width = 'auto';
    host.style.height = 'auto';
    host.style.transform = 'none';
    setIsPlaced(true);
    return true;
  }, [measureCompactPlacement, props.wide]);

  const syncPlacement = useCallback((animate: boolean) => {
    if (applyPlacement(animate)) return;
    requestAnimationFrame(() => {
      if (applyPlacement(animate)) return;
      requestAnimationFrame(() => {
        applyPlacement(animate);
      });
    });
  }, [applyPlacement]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const wasWide = wideRef.current;
    const isWide = props.wide;
    wideRef.current = isWide;

    if (!host) {
      syncPlacement(false);
      return;
    }

    const shouldFlip = wasWide !== isWide && isPlaced && !prefersReducedMotion();
    if (!shouldFlip) {
      syncPlacement(true);
      return;
    }

    const first = host.getBoundingClientRect();
    applyPlacement(false);
    const last = host.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      syncPlacement(true);
      return;
    }

    host.style.transition = 'none';
    host.style.transform = `translate(${dx}px, ${dy}px)`;

    requestAnimationFrame(() => {
      host.style.transition = `transform ${PLACEMENT_MS}ms ${PLACEMENT_EASE}, left ${PLACEMENT_MS}ms ${PLACEMENT_EASE}, top ${PLACEMENT_MS}ms ${PLACEMENT_EASE}`;
      if (isWide) {
        clearInlinePlacement(host);
        host.style.transform = 'none';
      } else {
        host.style.left = `${placementRef.current.left}px`;
        host.style.top = `${placementRef.current.top}px`;
        host.style.transform = 'none';
      }
    });
  }, [props.wide, applyPlacement, isPlaced, syncPlacement]);

  useLayoutEffect(() => {
    syncPlacement(false);
    const bar = props.titleBarRef.current;
    const host = hostRef.current;
    if (!bar) return undefined;

    const observer = new ResizeObserver(() => syncPlacement(true));
    observer.observe(bar);
    if (host) observer.observe(host);
    return () => observer.disconnect();
  }, [syncPlacement, props.titleBarRef]);

  return (
    <div
      ref={hostRef}
      className={[
        'title-bar__mode-switch',
        props.wide ? 'title-bar__mode-switch--wide' : 'title-bar__mode-switch--compact',
        isPlaced ? 'title-bar__mode-switch--placed' : '',
      ].filter(Boolean).join(' ')}
    >
      <ContentModeRail mode={props.mode} compact={!props.wide} />
    </div>
  );
}
