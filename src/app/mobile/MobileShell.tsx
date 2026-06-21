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

  // Pin the shell to the visible viewport height. In a *browser tab* the URL bar
  // collapses/expands, so `100dvh` overshoots and `visualViewport.height` is the
  // accurate measure; we publish it as `--app-height` (consumed by `.app-viewport`)
  // and keep it fresh across rotation, resize, and the launch settle.
  //
  // In a *standalone (PWA) launch* there is no browser chrome, so the CSS `100dvh`
  // fallback already fills the screen edge-to-edge (we ship `viewport-fit=cover`).
  // There, iOS's `visualViewport.height` under-reports — it returns the *safe*
  // viewport, inset from the home indicator — which would anchor the fixed shell
  // short of the screen and leave the bottom toolbar floating above a dead strip.
  // So we skip the JS measure in standalone and let `100dvh` drive the height.
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      document.documentElement.style.removeProperty('--app-height');
      return;
    }

    const vv = window.visualViewport;
    const setHeight = () => {
      const h = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    setHeight();
    vv?.addEventListener('resize', setHeight);
    window.addEventListener('resize', setHeight);
    window.addEventListener('orientationchange', setHeight);
    return () => {
      vv?.removeEventListener('resize', setHeight);
      window.removeEventListener('resize', setHeight);
      window.removeEventListener('orientationchange', setHeight);
      document.documentElement.style.removeProperty('--app-height');
    };
  }, []);

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
    <div
      className="app-viewport fixed inset-x-0 top-0 flex touch-manipulation flex-col gap-2 p-2 pt-[max(env(safe-area-inset-top),8px)]"
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
