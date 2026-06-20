import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/glass';
import { createProject } from '@/editor/commands/projectCommands';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import { registerAppCommandHandlers } from '@/app/commands/appCommands';
import { installNativeMenus, scheduleNativeMenuRefresh } from '@/app/commands/nativeMenu';
import { AppSettingsModal } from './AppSettingsModal';
import { ExportDialog } from './ExportDialog';
import { NewProjectModal } from './NewProjectModal';
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const loadAiSettings = useAiSettingsStore((s) => s.load);

  useEffect(() => {
    void loadAiSettings();
  }, [loadAiSettings]);

  useEffect(() => {
    const unregister = registerAppCommandHandlers({
      openNewProject: () => setNewProjectOpen(true),
      openExport: () => setExportOpen(true),
      openSettings: () => setSettingsOpen(true),
      openShortcuts: () => setShortcutsOpen(true),
      openDiagnostics: () =>
        window.dispatchEvent(new CustomEvent('calqo:open-diagnostics')),
    });
    return unregister;
  }, []);

  useEffect(() => installNativeMenus(), []);

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
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
      </GlassPanel>
      <AppSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
    </div>
  );
}
