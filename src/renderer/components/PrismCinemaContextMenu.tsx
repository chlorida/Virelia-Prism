import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nProvider';
import { usePlayerSheetPortal } from './player/usePlayerSheetPortal';

export type CinemaContextMenuIcon =
  | 'play'
  | 'queue'
  | 'heart'
  | 'open'
  | 'episodes'
  | 'playlist';

export interface CinemaContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  active?: boolean;
  icon?: CinemaContextMenuIcon;
}

export interface CinemaContextMenuSection {
  id: string;
  title?: string;
  layout?: 'list' | 'grid';
  items: CinemaContextMenuItem[];
}

interface PrismCinemaContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  headerTitle?: string;
  sections: CinemaContextMenuSection[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

function MenuIcon(props: { name: CinemaContextMenuIcon }) {
  switch (props.name) {
    case 'play':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="currentColor" />
        </svg>
      );
    case 'queue':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 7h12M5 12h12M5 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M19 12v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16.5 14.5 19 12l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 20.5s-7-4.35-7-9.2c0-2.8 2.1-4.8 4.8-4.8 1.5 0 2.9.7 3.2 1.8.3-1.1 1.7-1.8 3.2-1.8 2.7 0 4.8 2 4.8 4.8 0 4.85-7 9.2-7 9.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'open':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M8 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M13 5h6v6M11 13 19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'episodes':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="5" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="4" y="10" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="4" y="15" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'playlist':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 8h10M9 12h10M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="5.5" cy="8" r="1" fill="currentColor" />
          <circle cx="5.5" cy="12" r="1" fill="currentColor" />
          <circle cx="5.5" cy="16" r="1" fill="currentColor" />
        </svg>
      );
  }
}

function clampMenuPosition(x: number, y: number, width: number, height: number) {
  const pad = 12;
  const maxX = Math.max(pad, window.innerWidth - width - pad);
  const maxY = Math.max(pad, window.innerHeight - height - pad);
  return {
    left: Math.min(Math.max(pad, x), maxX),
    top: Math.min(Math.max(pad, y), maxY),
  };
}

export function PrismCinemaContextMenu(props: PrismCinemaContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const { mounted, sheetPhaseClass } = usePlayerSheetPortal(props.open);
  const [position, setPosition] = useState({ left: props.x, top: props.y });

  const updatePosition = useCallback(() => {
    const node = menuRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPosition(clampMenuPosition(props.x, props.y, rect.width, rect.height));
  }, [props.x, props.y]);

  useLayoutEffect(() => {
    if (!mounted) return;
    updatePosition();
  }, [mounted, props.x, props.y, props.sections, updatePosition]);

  useEffect(() => {
    if (!props.open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      props.onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
      }
    };
    const onScroll = () => props.onClose();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [props.open, props.onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={['prism-cinema-menu', sheetPhaseClass].filter(Boolean).join(' ')}
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label={t('media.context.menuLabel')}
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.headerTitle && (
        <div className="prism-cinema-menu__header">
          <span className="prism-cinema-menu__eyebrow">{t('media.context.menuEyebrow')}</span>
          <strong className="prism-cinema-menu__title">{props.headerTitle}</strong>
        </div>
      )}
      {props.sections.map((section) => (
        <section key={section.id} className="prism-cinema-menu__section">
          {section.title && (
            <span className="prism-cinema-menu__section-title">{section.title}</span>
          )}
          <div className={section.layout === 'grid' ? 'prism-cinema-menu__grid' : 'prism-cinema-menu__list'}>
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={[
                  'prism-cinema-menu__item',
                  item.active ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.disabled) return;
                  props.onSelect(item.id);
                  props.onClose();
                }}
              >
                {item.icon && section.layout !== 'grid' && (
                  <span className="prism-cinema-menu__icon" aria-hidden>
                    <MenuIcon name={item.icon} />
                  </span>
                )}
                <span className="prism-cinema-menu__label">{item.label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>,
    document.body
  );
}
