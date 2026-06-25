import { Component, type ErrorInfo, type ReactNode } from 'react';
import { resetAppLocalState } from '../lib/appStateReset';
import { startupError, startupLog } from '../lib/startupLog';
import { detectLocaleFromTag, translate } from '../../shared/i18n';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function boundaryLocale() {
  if (typeof navigator === 'undefined') return 'en' as const;
  return detectLocaleFromTag(navigator.language);
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    startupError('renderer crash', error);
    if (errorInfo.componentStack) {
      startupLog('component stack', errorInfo.componentStack);
    }
    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleResetState = (): void => {
    try {
      resetAppLocalState();
      startupLog('local app state cleared');
    } catch (resetError) {
      startupError('reset failed', resetError);
    }
    window.location.reload();
  };

  private handleCopy = async (): Promise<void> => {
    const text = this.formatErrorDetails();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  private formatErrorDetails(): string {
    const { error, errorInfo } = this.state;
    return [
      error?.name,
      error?.message,
      error?.stack,
      errorInfo?.componentStack
    ].filter(Boolean).join('\n\n');
  }

  render(): ReactNode {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;

    const locale = boundaryLocale();
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    const isDev = import.meta.env.DEV;

    return (
      <div className="fatal-error-screen">
        <div className="fatal-error-screen__card">
          <p className="eyebrow">Virelia Prism</p>
          <h1>{t('error.fatal.title')}</h1>
          <p className="fatal-error-screen__lead">
            {t('error.fatal.lead')}
          </p>
          {isDev && (
            <pre className="fatal-error-screen__details">{this.formatErrorDetails()}</pre>
          )}
          {!isDev && error.message && (
            <p className="fatal-error-screen__hint">{error.message}</p>
          )}
          <div className="fatal-error-screen__actions">
            <button type="button" className="primary-button" onClick={this.handleReload}>
              {t('error.fatal.reload')}
            </button>
            <button type="button" className="ghost-button" onClick={this.handleResetState}>
              {t('error.fatal.resetState')}
            </button>
            <button type="button" className="ghost-button" onClick={() => { void this.handleCopy(); }}>
              {t('error.fatal.copyDetails')}
            </button>
          </div>
          {isDev && errorInfo?.componentStack && (
            <details className="fatal-error-screen__stack">
              <summary>{t('error.fatal.componentStack')}</summary>
              <pre>{errorInfo.componentStack}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
