import { useEffect } from 'react';
import { useUiStore, applyUiAttributes } from '@/lib/state/uiStore';
import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from './shell/AppShell';

export function App() {
  const theme = useUiStore((s) => s.theme);
  const transparency = useUiStore((s) => s.transparency);

  // Keep the document attributes in sync with the resolved initial preferences
  // (the store only writes them on user changes).
  useEffect(() => {
    applyUiAttributes(theme, transparency);
  }, [theme, transparency]);

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
