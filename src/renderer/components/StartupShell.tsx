interface StartupShellProps {
  message?: string;
}

export function StartupShell(props: StartupShellProps) {
  return (
    <div className="startup-shell" role="status" aria-live="polite">
      <div className="startup-shell__card">
        <p className="eyebrow">Virelia Prism</p>
        <h1 className="startup-shell__title">{props.message ?? 'Loading library…'}</h1>
        <div className="startup-shell__spinner" aria-hidden />
      </div>
    </div>
  );
}
