import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { isTauri } from '@/lib/platform/runtime';
import { useUiStore, applyUiAttributes } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import {
  hydrateWorkspace,
  flushPendingSaves,
  nudgeSelectedLayers,
  shiftSelectionZOrder,
} from '@/editor/commands/projectCommands';
import { invokeAppCommandSync } from './commands/appCommands';
import { installNativeFileDrops } from './commands/nativeFileDrops';
import { initAgentDrawing } from '@/editor/mcp/bridge';
import {
  isEditableKeyboardTarget,
  isKeyboardEventInsideModal,
} from './keyboardGuards';

/** Keyboard nudge increments (artboard px): a fine step and a coarse step. */
const NUDGE_SMALL = 1;
const NUDGE_LARGE = 10;
import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from './shell/AppShell';
import { ConfirmHost } from './shell/ConfirmHost';
import { MobileShell } from './mobile/MobileShell';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { PwaInstallPrompt } from './PwaInstallPrompt';
import { usePhoneLayout } from '@/lib/hooks/useResponsiveMode';

export function App() {
  const theme = useUiStore((s) => s.theme);
  const transparency = useUiStore((s) => s.transparency);
  const phone = usePhoneLayout();

  // Keep the document attributes in sync with the resolved initial preferences
  // (the store only writes them on user changes).
  useEffect(() => {
    applyUiAttributes(theme, transparency);
  }, [theme, transparency]);

  useEffect(() => installNativeFileDrops(), []);

  // Agent drawing (desktop only): listen for forwarded MCP requests and
  // auto-start the embedded server when the settings toggle is enabled.
  useEffect(() => initAgentDrawing(), []);

  // Reopen last session's tabs from IndexedDB, and flush saves before unload.
  useEffect(() => {
    void hydrateWorkspace();

    const onBeforeUnload = () => {
      void flushPendingSaves();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    const onKeyDown = (e: KeyboardEvent) => {
      const typing = isEditableKeyboardTarget(e.target);
      const key = e.key.toLowerCase();
      const id = useWorkspaceStore.getState().activeProjectId;

      if (isKeyboardEventInsideModal(e)) return;

      if ((e.metaKey || e.ctrlKey) && key === 'n') {
        e.preventDefault();
        invokeAppCommandSync('file.new');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'o') {
        e.preventDefault();
        invokeAppCommandSync('file.open');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 's') {
        e.preventDefault();
        invokeAppCommandSync(e.shiftKey ? 'file.saveAs' : 'file.save');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'e') {
        e.preventDefault();
        invokeAppCommandSync(e.shiftKey ? 'file.share' : 'file.export');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key === 'z') {
        e.preventDefault();
        invokeAppCommandSync('edit.undo');
        return;
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'z') ||
        ((e.metaKey || e.ctrlKey) && key === 'y')
      ) {
        e.preventDefault();
        invokeAppCommandSync('edit.redo');
        return;
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
          const dx =
            key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
          const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
          nudgeSelectedLayers(id, dx, dy);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'c') {
        e.preventDefault();
        invokeAppCommandSync('edit.copy');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'v') {
        e.preventDefault();
        invokeAppCommandSync('edit.paste');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'a') {
        e.preventDefault();
        invokeAppCommandSync('edit.selectAll');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === 'g') {
        e.preventDefault();
        invokeAppCommandSync(e.shiftKey ? 'object.ungroup' : 'object.group');
        return;
      }
      if (key === '[') {
        e.preventDefault();
        if (id)
          shiftSelectionZOrder(
            id,
            e.metaKey || e.ctrlKey ? 'back' : 'backward',
          );
        return;
      }
      if (key === ']') {
        e.preventDefault();
        if (id)
          shiftSelectionZOrder(
            id,
            e.metaKey || e.ctrlKey ? 'front' : 'forward',
          );
        return;
      }
      if (key === 'v') useUiStore.getState().setActiveTool('select');
      if (key === 'm') useUiStore.getState().setActiveTool('marquee');
      if (key === 'h') useUiStore.getState().setActiveTool('pan');
      if (key === 't') useUiStore.getState().setActiveTool('text');
      if (key === 'r') useUiStore.getState().setActiveTool('rect');
      if (key === 'e') useUiStore.getState().setActiveTool('ellipse');
      if (e.shiftKey && key === 'l')
        useUiStore.getState().setActiveTool('list');
      else if (key === 'l') useUiStore.getState().setActiveTool('line');
      if (key === 'i') useUiStore.getState().setActiveTool('image');
      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        invokeAppCommandSync('window.shortcuts');
      }
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        invokeAppCommandSync('edit.delete');
      }
      if ((e.metaKey || e.ctrlKey) && key === 'd') {
        e.preventDefault();
        invokeAppCommandSync('edit.duplicate');
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
      {phone ? <MobileShell /> : <AppShell />}
      <ConfirmHost />
      <PwaUpdatePrompt />
      <PwaInstallPrompt />
      {/* Vercel Web Analytics — browser deploy only, not the Tauri shell. */}
      {!isTauri && <Analytics />}
    </ErrorBoundary>
  );
}
