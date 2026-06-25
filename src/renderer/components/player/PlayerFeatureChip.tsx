import { forwardRef, type ReactNode } from 'react';

export interface PlayerFeatureChipProps {
  label: string;
  /** Popover / menu is open */
  open?: boolean;
  /** Feature is enabled (e.g. subtitles on) */
  on?: boolean;
  busy?: boolean;
  badge?: string;
  disabled?: boolean;
  className?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

export const PlayerFeatureChip = forwardRef<HTMLButtonElement, PlayerFeatureChipProps>(
  function PlayerFeatureChip(props, ref) {
    const className = [
      'player-feature-chip',
      props.open ? 'is-open' : '',
      props.on ? 'is-on' : '',
      props.busy ? 'is-busy' : '',
      props.className ?? '',
    ]
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
        disabled={props.disabled || props.busy}
        onClick={props.onClick}
      >
        <span className="player-feature-chip__icon" aria-hidden>
          {props.children}
        </span>
        {props.badge ? (
          <span className="player-feature-chip__badge">{props.badge}</span>
        ) : null}
        {props.busy ? <span className="player-feature-chip__spinner" aria-hidden /> : null}
      </button>
    );
  },
);
