import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nProvider';
import { IconSettings } from './PlayerIcons';
import { IconButton } from './IconButton';
import { PLAYBACK_SPEEDS } from './SpeedMenu';

interface PlayerSettingsMenuProps {
  speed: number;
  disabled?: boolean;
  onSpeedChange: (speed: number) => void;
  onOpenChange?: (open: boolean) => void;
}

export function PlayerSettingsMenu(props: PlayerSettingsMenuProps) {
  const { t } = useI18n();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0 });

  const setOpenState = useCallback((next: boolean) => {
    setOpen(next);
    props.onOpenChange?.(next);
  }, [props.onOpenChange]);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 160;
    const menuHeight = menuRef.current?.offsetHeight ?? 200;
    const gap = 8;
    const margin = 8;
    let top = rect.top - gap - menuHeight;
    let left = rect.right - menuWidth;
    if (top < margin) top = rect.bottom + gap;
    top = Math.max(margin, Math.min(top, window.innerHeight - menuHeight - margin));
    left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
    setMenuStyle({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
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

  const menu = open && !props.disabled ? createPortal(
    <div
      ref={menuRef}
      id={menuId}
      className="player-settings-menu"
      role="menu"
      style={{ position: 'fixed', top: menuStyle.top, left: menuStyle.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="player-settings-menu__section">
        <span className="player-settings-menu__label">{t('player.speed')}</span>
        <div className="player-settings-menu__speeds">
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              role="menuitemradio"
              aria-checked={speed === props.speed}
              className={speed === props.speed ? 'is-active' : ''}
              onClick={() => {
                props.onSpeedChange(speed);
                setOpenState(false);
              }}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <IconButton
        ref={buttonRef}
        label={t('player.settings')}
        active={open}
        disabled={props.disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (props.disabled) return;
          setOpenState(!open);
        }}
      >
        <IconSettings />
      </IconButton>
      {menu}
    </>
  );
}
