import { useCallback, useEffect, useRef, useState, type AnimationEvent, type ChangeEvent } from 'react';

export interface PrismToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

type TogglePhase = 'idle' | 'to-on' | 'to-off';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PrismToggle(props: PrismToggleProps) {
  const { checked, onCheckedChange, disabled, className, id, 'aria-label': ariaLabel } = props;
  const [phase, setPhase] = useState<TogglePhase>('idle');
  const skipAnimRef = useRef(true);

  useEffect(() => {
    skipAnimRef.current = false;
  }, []);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked;
    if (!prefersReducedMotion() && !skipAnimRef.current) {
      setPhase(next ? 'to-on' : 'to-off');
    }
    onCheckedChange(next);
  }, [onCheckedChange]);

  const handleAnimationEnd = useCallback((event: AnimationEvent<HTMLSpanElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.animationName !== 'prism-toggle-morph-on' && event.animationName !== 'prism-toggle-morph-off') {
      return;
    }
    setPhase('idle');
  }, []);

  return (
    <label
      className={[
        'prism-toggle',
        checked ? 'is-checked' : '',
        phase === 'to-on' ? 'is-anim-to-on' : '',
        phase === 'to-off' ? 'is-anim-to-off' : '',
        disabled ? 'is-disabled' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      <input
        type="checkbox"
        className="sr-only prism-toggle__input"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        id={id}
        aria-label={ariaLabel}
      />
      <span className="prism-toggle__track" aria-hidden="true">
        <span className="prism-toggle__well" />
        <span
          className="prism-toggle__thumb"
          onAnimationEnd={handleAnimationEnd}
        >
          <span className="prism-toggle__icon prism-toggle__icon--off">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="prism-toggle__icon prism-toggle__icon--on">
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.4 6.1 4.9 8.6 9.6 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </span>
    </label>
  );
}
