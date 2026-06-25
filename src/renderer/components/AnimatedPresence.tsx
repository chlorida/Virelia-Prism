import type { CSSProperties, ReactNode } from 'react';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';

type AnimatedPresencePhase = 'enter' | 'exit' | 'idle';

function phaseClass(prefix: string, phase: AnimatedPresencePhase): string {
  if (phase === 'idle') return '';
  return phase === 'enter' ? `${prefix}--enter` : `${prefix}--exit`;
}

interface AnimatedPresenceProps {
  open: boolean;
  className?: string;
  exitDurationMs?: number;
  role?: string;
  'aria-modal'?: boolean | 'true' | 'false';
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function AnimatedPresence(props: AnimatedPresenceProps) {
  const { open, className = '', exitDurationMs = 220, children, ...rest } = props;

  const { shouldRender, phase, onAnimationEnd } = useAnimatedPresence({
    visible: open,
    exitDurationMs,
  });

  if (!shouldRender) return null;

  return (
    <div
      className={[className, phaseClass('prism-animate-backdrop', phase)].filter(Boolean).join(' ')}
      onAnimationEnd={onAnimationEnd}
      {...rest}
    >
      {children}
    </div>
  );
}

interface ModalAnimatedPresenceProps {
  open: boolean;
  className?: string;
  panelClassName?: string;
  exitDurationMs?: number;
  role?: string;
  'aria-modal'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
  onBackdropClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function ModalAnimatedPresence(props: ModalAnimatedPresenceProps) {
  const {
    open,
    className = 'modal-backdrop',
    panelClassName = '',
    exitDurationMs = 220,
    children,
    onBackdropClick,
    ...rest
  } = props;

  const { shouldRender, phase, onAnimationEnd } = useAnimatedPresence({
    visible: open,
    exitDurationMs,
  });

  if (!shouldRender) return null;

  return (
    <div
      className={[className, phaseClass('prism-animate-backdrop', phase)].filter(Boolean).join(' ')}
      onClick={onBackdropClick}
      onAnimationEnd={onAnimationEnd}
      {...rest}
    >
      <div
        className={[
          panelClassName,
          phaseClass('prism-animate-panel', phase),
        ].filter(Boolean).join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

interface PopoverAnimatedPresenceProps {
  open: boolean;
  className?: string;
  style?: CSSProperties;
  exitDurationMs?: number;
  role?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function PopoverAnimatedPresence(props: PopoverAnimatedPresenceProps) {
  const { open, className = '', style, exitDurationMs = 160, children, ...rest } = props;

  const { shouldRender, phase, onAnimationEnd } = useAnimatedPresence({
    visible: open,
    exitDurationMs,
  });

  if (!shouldRender) return null;

  return (
    <div
      className={[className, phaseClass('prism-animate-popover', phase)].filter(Boolean).join(' ')}
      style={style}
      onAnimationEnd={onAnimationEnd}
      {...rest}
    >
      {children}
    </div>
  );
}

interface OverlayAnimatedPresenceProps {
  open: boolean;
  className?: string;
  panelClassName?: string;
  exitDurationMs?: number;
  role?: string;
  'aria-label'?: string;
  children: ReactNode;
  backdrop?: ReactNode;
}

/** Full-screen overlay with separate backdrop + panel (e.g. search palette). */
export function OverlayAnimatedPresence(props: OverlayAnimatedPresenceProps) {
  const {
    open,
    className = '',
    panelClassName = '',
    exitDurationMs = 220,
    children,
    backdrop,
    ...rest
  } = props;

  const { shouldRender, phase, onAnimationEnd } = useAnimatedPresence({
    visible: open,
    exitDurationMs,
  });

  if (!shouldRender) return null;

  const backdropAnim = phaseClass('prism-animate-backdrop', phase);
  const panelAnim = phaseClass('prism-animate-panel', phase);

  return (
    <div className={className} onAnimationEnd={onAnimationEnd} {...rest}>
      {backdrop && (
        <div className={backdropAnim} style={{ position: 'absolute', inset: 0 }}>
          {backdrop}
        </div>
      )}
      <div className={[panelClassName, panelAnim].filter(Boolean).join(' ')}>
        {children}
      </div>
    </div>
  );
}
