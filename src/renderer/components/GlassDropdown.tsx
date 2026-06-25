import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface GlassDropdownOption<T extends string> {
  value: T;
  label: string;
}

interface GlassDropdownProps<T extends string> {
  value: T;
  options: readonly GlassDropdownOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  triggerClassName?: string;
  preferOpenUp?: boolean;
}

export function GlassDropdown<T extends string>(props: GlassDropdownProps<T>) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const selected = props.options.find((option) => option.value === props.value);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = menu?.offsetWidth ?? 160;
    const menuHeight = menu?.offsetHeight ?? 200;
    const gap = 8;
    const margin = 8;
    const openUp = props.preferOpenUp ?? rect.bottom > window.innerHeight * 0.55;

    let top = openUp ? rect.top - gap - menuHeight : rect.bottom + gap;
    let left = rect.left;

    top = Math.max(margin, Math.min(top, window.innerHeight - menuHeight - margin));
    left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));

    setMenuStyle({ top, left });
  }, [props.preferOpenUp]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, props.options.length]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const menu = open && !props.disabled ? createPortal(
    <div
      ref={menuRef}
      id={menuId}
      className="glass-dropdown-popover"
      role="listbox"
      style={{ position: 'fixed', top: menuStyle.top, left: menuStyle.left }}
    >
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === props.value}
          className={option.value === props.value ? 'glass-dropdown-popover__item is-active' : 'glass-dropdown-popover__item'}
          onClick={() => {
            props.onChange(option.value);
            setOpen(false);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className={props.className ?? 'glass-dropdown'}>
      <button
        ref={buttonRef}
        type="button"
        className={props.triggerClassName ?? 'glass-dropdown__trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        onClick={() => {
          if (props.disabled) return;
          setOpen((value) => !value);
        }}
      >
        {selected?.label ?? props.value}
      </button>
      {menu}
    </div>
  );
}
