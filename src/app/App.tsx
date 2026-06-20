import { useEffect } from 'react';
import { useUiStore, applyUiAttributes } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import {
  copySelectedLayers,
  deleteSelectedLayers,
  duplicateSelectedLayers,
  groupSelectedLayers,
  hydrateWorkspace,
  flushPendingSaves,
  nudgeSelectedLayers,
  pasteLayers,
  redoProject,
  saveProject,
  selectAllLayers,
  shiftSelectionZOrder,
  undoProject,
  ungroupSelected,
} from '@/editor/commands/projectCommands';

/** Keyboard nudge increments (artboard px): a fine step and a coarse step. */
const NUDGE_SMALL = 1;
const NUDGE_LARGE = 10;
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
      if (
        key === 'arrowup' ||
        key === 'arrowdown' ||
        key === 'arrowleft' ||
        key === 'arrowright'
      ) {
        e.preventDefault();
        if (id) {
          const step = e.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
          const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
          const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
          nudgeSelectedLayers(id, dx, dy);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'c') {
        if (id) copySelectedLayers(id);
      }
      if ((e.metaKey || e.ctrlKey) && key === 'v') {
        e.preventDefault();
        if (id) pasteLayers(id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'a') {
        e.preventDefault();
        if (id) selectAllLayers(id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'g') {
        e.preventDefault();
        if (id) {
          if (e.shiftKey) ungroupSelected(id);
          else groupSelectedLayers(id);
        }
        return;
      }
      if (key === '[') {
        e.preventDefault();
        if (id) shiftSelectionZOrder(id, e.metaKey || e.ctrlKey ? 'back' : 'backward');
        return;
      }
      if (key === ']') {
        e.preventDefault();
        if (id) shiftSelectionZOrder(id, e.metaKey || e.ctrlKey ? 'front' : 'forward');
        return;
      }
      if (key === 'v') useUiStore.getState().setActiveTool('select');
      if (key === 'm') useUiStore.getState().setActiveTool('marquee');
      if (key === 'h') useUiStore.getState().setActiveTool('pan');
      if (key === 't') useUiStore.getState().setActiveTool('text');
      if (key === 'r') useUiStore.getState().setActiveTool('rect');
      if (key === 'e') useUiStore.getState().setActiveTool('ellipse');
      if (e.shiftKey && key === 'l') useUiStore.getState().setActiveTool('list');
      else if (key === 'l') useUiStore.getState().setActiveTool('line');
      if (key === 'i') useUiStore.getState().setActiveTool('image');
      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('calqo:open-shortcuts'));
      }
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
