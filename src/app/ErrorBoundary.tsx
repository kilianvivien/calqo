import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { GlassPanel, GlassButton } from '@/components/glass';

interface Props extends WithTranslation {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Calqo] uncaught error', error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    const { t, children } = this.props;
    if (!error) return children;

    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <GlassPanel
          strong
          className="max-w-md space-y-3 rounded-[var(--calqo-radius-lg)] p-6"
        >
          <h1 className="text-[15px] font-semibold">{t('boundary.title')}</h1>
          <p className="text-[12.5px] text-[var(--calqo-text-2)]">
            {t('boundary.body')}
          </p>
          <pre className="mono max-h-32 overflow-auto rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-hover)] p-2 text-[11px] text-[var(--calqo-text-3)]">
            {error.message}
          </pre>
          <GlassButton
            variant="primary"
            onClick={() => window.location.reload()}
          >
            {t('boundary.reload')}
          </GlassButton>
        </GlassPanel>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation('errors')(ErrorBoundaryInner);
