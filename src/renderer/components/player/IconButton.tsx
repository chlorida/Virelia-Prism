import { forwardRef, type ReactNode } from 'react';

interface IconButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(props, ref) {
  const className = ['vc-icon-btn', props.active ? 'is-active' : '', props.className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={ref}
      type="button"
      data-video-control
      className={className}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
});
