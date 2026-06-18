import { useEffect } from 'react';
import { useUiStore, applyUiAttributes } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import {
  deleteSelectedLayers,
  duplicateSelectedLayers,
  hydrateWorkspace,
  flushPendingSaves,
  redoProject,
  saveProject,
  undoProject,
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
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      const key = e.key.toLowerCase();
      const id = useWorkspaceStore.getState().activeProjectId;

      if ((e.metaKey || e.ctrlKey) && key === 's') {
        e.preventDefault();
        if (id) void saveProject(id);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key === 'z') {
        e.preventDefault();
        if (id) undoProject(id);
      }
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'z') || ((e.metaKey || e.ctrlKey) && key === 'y')) {
        e.preventDefault();
        if (id) redoProject(id);
      }
      if (typing) return;
      if (key === 'v') useUiStore.getState().setActiveTool('select');
      if (key === 'h') useUiStore.getState().setActiveTool('pan');
      if (key === 't') useUiStore.getState().setActiveTool('text');
      if (key === 'r') useUiStore.getState().setActiveTool('rect');
      if (key === 'e') useUiStore.getState().setActiveTool('ellipse');
      if (key === 'l') useUiStore.getState().setActiveTool('line');
      if (key === 'i') useUiStore.getState().setActiveTool('image');
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        if (id) deleteSelectedLayers(id);
      }
      if ((e.metaKey || e.ctrlKey) && key === 'd') {
        e.preventDefault();
        if (id) duplicateSelectedLayers(id);
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
