import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nProvider';
import { useOptionalPlayerPopover } from './playerPopoverContext';
import { usePlayerSheetPortal } from './usePlayerSheetPortal';

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface SpeedMenuProps {
  value: number;
  disabled?: boolean;
  className?: string;
  variant?: 'bar' | 'chip';
  dataVideoControl?: boolean;
  onChange: (speed: number) => void;
  onOpenChange?: (open: boolean) => void;
}

function SpeedChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SpeedMenu(props: SpeedMenuProps) {
  const { t } = useI18n();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const popover = useOptionalPlayerPopover();
  const [localOpen, setLocalOpen] = useState(false);
  const [sheetPos, setSheetPos] = useState({ top: 0, left: 0 });
  const variant = props.variant ?? 'bar';
  const open = popover ? popover.isOpen('speed') : localOpen;
  const { mounted: sheetMounted, sheetPhaseClass } = usePlayerSheetPortal(open);

  const setOpenState = useCallback((next: boolean) => {
    if (popover) {
      if (next) popover.open('speed');
      else popover.close();
    } else {
      setLocalOpen(next);
    }
    props.onOpenChange?.(next);
  }, [popover, props.onOpenChange]);

  const updateSheetPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setSheetPos({
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }, []);

  useLayoutEffect(() => {
    if (!sheetMounted) return;
    updateSheetPosition();
  }, [sheetMounted, updateSheetPosition, props.value, sheetPhaseClass]);

  useEffect(() => {
    if (!sheetMounted) return;
    const onLayout = () => updateSheetPosition();
    window.addEventListener('resize', onLayout);
    window.addEventListener('scroll', onLayout, true);
    return () => {
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    };
  }, [sheetMounted, updateSheetPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (sheetRef.current?.contains(target)) return;
      setOpenState(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpenState(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open, setOpenState]);

  const rootClass = [
    'speed-menu',
    variant === 'chip' ? 'speed-menu--chip' : '',
    open ? 'is-open' : '',
    props.className ?? '',
  ].filter(Boolean).join(' ');

  const speedLabel = t('player.speed');
  const displayValue = Number.isInteger(props.value) ? `${props.value}` : `${props.value}`;

  const sheet = sheetMounted && !props.disabled ? createPortal(
    <div
      ref={sheetRef}
      id={menuId}
      className={[
        'speed-menu__sheet',
        'speed-menu__sheet--portal',
        'player-control-sheet',
        'player-control-sheet--anchor-center',
        sheetPhaseClass,
        variant === 'chip' ? 'speed-menu__sheet--chip' : '',
      ].filter(Boolean).join(' ')}
      style={{ top: sheetPos.top, left: sheetPos.left }}
      role="menu"
      aria-label={speedLabel}
      data-video-control={props.dataVideoControl ? true : undefined}
      onClick={props.dataVideoControl ? (e) => e.stopPropagation() : undefined}
    >
      {variant === 'chip' && (
        <span className="speed-menu__sheet-title">{speedLabel}</span>
      )}
      <div className={variant === 'chip' ? 'speed-menu__options speed-menu__options--grid' : 'speed-menu__options'}>
        {PLAYBACK_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            role="menuitemradio"
            aria-checked={speed === props.value}
            className={speed === props.value ? 'speed-menu__option is-active' : 'speed-menu__option'}
            data-video-control={props.dataVideoControl ? true : undefined}
            onClick={() => {
              props.onChange(speed);
              setOpenState(false);
            }}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={rootRef} className={rootClass}>
      <button
        ref={buttonRef}
        type="button"
        className={variant === 'chip' ? 'speed-menu__trigger' : 'speed-menu__trigger ghost-button'}
        data-video-control={props.dataVideoControl ? true : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={speedLabel}
        disabled={props.disabled}
        title={speedLabel}
        onClick={(event) => {
          if (props.disabled) return;
          if (props.dataVideoControl) event.stopPropagation();
          const next = popover ? !popover.isOpen('speed') : !open;
          setOpenState(next);
        }}
      >
        <span className="speed-menu__glyph" aria-hidden>
          <span className="speed-menu__label">{displayValue}x</span>
          <span className="speed-menu__arrow">
            <SpeedChevronUpIcon />
          </span>
        </span>
      </button>
      {sheet}
    </div>
  );
}
