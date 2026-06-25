interface PrismLoadingSpinnerProps {
  label?: string;
  className?: string;
  inline?: boolean;
}

export function PrismLoadingSpinner(props: PrismLoadingSpinnerProps) {
  const className = [
    props.inline ? 'prism-loading-state prism-loading-state--inline' : 'prism-loading-state',
    props.className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <span className="prism-loading-state__spinner" aria-hidden />
      {props.label ? <p>{props.label}</p> : null}
    </div>
  );
}
