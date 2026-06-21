import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { useActiveProject } from '@/lib/state/selectors';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import { createProject, openProject } from '@/editor/commands/projectCommands';
import type { ArtboardPresetId } from '@/lib/schema/presets';
import { GlassIconButton } from '@/components/glass';
import { MobileProjectBrowser } from './MobileProjectBrowser';
import { MobileEditor } from './MobileEditor';
import { MobileTopBar } from './MobileTopBar';
import { MobileSettingsSheet } from './sheets/MobileSettingsSheet';

type Mode = 'browser' | 'editor';

/** The phone shell. Replaces the desktop titlebar/docks/inspector layout with a
 * compact full-viewport flow: a project browser that opens into a touch-first
 * editor. Only mounted on phone viewports in the browser build (never Tauri). */
export function MobileShell() {
  const { t } = useTranslation('editor');
  const [mode, setMode] = useState<Mode>('browser');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const project = useActiveProject();
  const loadAiSettings = useAiSettingsStore((s) => s.load);

  useEffect(() => {
    void loadAiSettings();
  }, [loadAiSettings]);

  // Keep zoom confined to the canvas: iOS Safari ignores `user-scalable=no`, so
  // suppress its pinch-gesture events here (the canvas runs its own pinch-zoom
  // via touch events, which these don't block). Only active on the phone shell.
  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault();
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('gesturechange', prevent);
    document.addEventListener('gestureend', prevent);
    return () => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend', prevent);
    };
  }, []);

  const openAndEdit = (id: string) => {
    void openProject(id).then(() => setMode('editor'));
  };

  const createAndEdit = (preset: ArtboardPresetId) => {
    void createProject({ preset }).then(() => setMode('editor'));
  };

  const showEditor = mode === 'editor' && project;

  return (
    // Fill the *usable* screen as a normal-flow flex column. Because we drop
    // `viewport-fit=cover` (see index.html), iOS insets the web view to the safe
    // area, so `100dvh` is exactly the visible height and the toolbar — the last
    // child of the editor's flex-1 column — sits at the bottom with no
    // `position:fixed` and no `env()` math. The height must be *definite* (not
    // `min-h-*`): the canvas sizes itself from a chain of `flex-1`/`h-full`
    // descendants, and an `h-full` (height:100%) only resolves against a parent
    // with a definite height — a bare `min-height` leaves it auto, collapsing
    // the stage to 0px (blank canvas). `h-screen` (100vh) is the Safari-14
    // fallback ahead of `h-[100dvh]` (dvh is Safari 15.4+).
    <div
      className="app-shell flex h-screen h-[100dvh] touch-manipulation flex-col gap-2 p-2"
      style={{ background: 'var(--calqo-workspace)' }}
    >
      {showEditor ? (
        <MobileEditor project={project} onBack={() => setMode('browser')} />
      ) : (
        <>
          <MobileTopBar
            title={t('mobile.browser.title')}
            actions={
              <GlassIconButton
                label={t('settings.open', { ns: 'common' })}
                showTitle={false}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={16} />
              </GlassIconButton>
            }
          />
          <MobileProjectBrowser onOpen={openAndEdit} onCreate={createAndEdit} />
        </>
      )}

      <MobileSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
