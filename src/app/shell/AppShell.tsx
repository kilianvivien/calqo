import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/glass';
import { createProject } from '@/editor/commands/projectCommands';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import { registerAppCommandHandlers, invokeAppCommandSync } from '@/app/commands/appCommands';
import { isTauri } from '@/lib/platform/runtime';
import { installNativeMenus, scheduleNativeMenuRefresh } from '@/app/commands/nativeMenu';
import { AppSettingsModal, type SettingsTab } from './AppSettingsModal';
import { ExportDialog } from './ExportDialog';
import { NewProjectModal } from './NewProjectModal';
import { ProjectManagerModal } from './ProjectManagerModal';
import { PromptTemplateDialog } from './PromptTemplateDialog';
import { SvgLibraryDialog } from './SvgLibraryDialog';
import { ShortcutHelpModal } from './ShortcutHelpModal';
import { TranslateDialog } from './TranslateDialog';
import { TitleBar } from './TitleBar';
import { TabBar } from './TabBar';
import { ToolRail } from './ToolRail';
import { Workspace } from './Workspace';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { useProjectStore } from '@/lib/state/projectStore';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useHistoryStore } from '@/lib/state/historyStore';

/** The app window. The tab strip appears only when there are multiple open
 * projects, matching GeoCarto's quieter one-document chrome. */
export function AppShell() {
  const openTabCount = useWorkspaceStore((s) => s.openTabIds.length);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const saveState = useProjectStore((s) => s.saveState);
  const selection = useSelectionStore((s) => s.selectedLayerIds);
  const histories = useHistoryStore((s) => s.histories);
  const showTabs = openTabCount > 1;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const loadAiSettings = useAiSettingsStore((s) => s.load);

  useEffect(() => {
    void loadAiSettings();
  }, [loadAiSettings]);

  useEffect(() => {
    const unregister = registerAppCommandHandlers({
      openNewProject: () => setNewProjectOpen(true),
      openProjects: () => setProjectsOpen(true),
      openExport: () => setExportOpen(true),
      openSettings: () => {
        setSettingsTab('general');
        setSettingsOpen(true);
      },
      openShortcuts: () => setShortcutsOpen(true),
      openDiagnostics: () => {
        setSettingsTab('diagnostics');
        setSettingsOpen(true);
      },
    });
    return unregister;
  }, []);

  useEffect(() => installNativeMenus(), []);

  // No-flash startup: the desktop window is created hidden (tauri.conf.json
  // `visible: false`) and revealed here once the glass UI has mounted, so the
  // user never sees the empty native window frame. show() must run directly in
  // the effect — NOT inside requestAnimationFrame, whose callbacks are paused
  // while the window is hidden, which would deadlock the reveal.
  useEffect(() => {
    if (!isTauri) return;
    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().show();
      } catch {
        // Window/show unavailable — nothing more we can do to reveal it.
      }
    })();
  }, []);

  useEffect(() => {
    scheduleNativeMenuRefresh();
  }, [activeProjectId, saveState, selection, histories]);

  useEffect(() => {
    const openShortcuts = () => setShortcutsOpen(true);
    window.addEventListener('calqo:open-shortcuts', openShortcuts);
    return () => window.removeEventListener('calqo:open-shortcuts', openShortcuts);
  }, []);

  return (
    <div className="h-full w-full">
      <GlassPanel
        strong
        className="grid h-full w-full overflow-hidden rounded-none border-0 shadow-none"
        style={{
          gridTemplateRows: showTabs
            ? '44px 36px minmax(0, 1fr) 28px'
            : '44px minmax(0, 1fr) 28px',
        }}
      >
        <TitleBar />
        {showTabs && <TabBar />}

        <div className="grid min-h-0 grid-cols-[auto_1fr_auto]">
          <ToolRail />
          <div className="relative min-h-0 min-w-0">
            <Workspace />
          </div>
          <Inspector />
        </div>

        <StatusBar
          onOpenSettings={() => {
            setSettingsTab('general');
            setSettingsOpen(true);
          }}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
      </GlassPanel>
      <AppSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
      />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <PromptTemplateDialog />
      <SvgLibraryDialog />
      <ShortcutHelpModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <TranslateDialog />
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onSelect={(preset) => {
          void createProject({ preset });
          setNewProjectOpen(false);
          scheduleNativeMenuRefresh();
        }}
      />
      <ProjectManagerModal
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        onNew={() => setNewProjectOpen(true)}
        onImport={() => invokeAppCommandSync('file.open')}
      />
    </div>
  );
}
