import { useEffect } from 'react';
import { useUiStore, applyUiAttributes } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import {
  hydrateWorkspace,
  flushPendingSaves,
  saveProject,
} from '@/editor/commands/projectCommands';
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

  // Reopen last session's tabs from IndexedDB, and flush saves before unload.
  useEffect(() => {
    void hydrateWorkspace();

    const onBeforeUnload = () => {
      void flushPendingSaves();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const id = useWorkspaceStore.getState().activeProjectId;
        if (id) void saveProject(id);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
