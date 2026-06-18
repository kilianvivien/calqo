import { useState } from 'react';
import { GlassPanel } from '@/components/glass';
import { AppSettingsModal } from './AppSettingsModal';
import { TitleBar } from './TitleBar';
import { TabBar } from './TabBar';
import { ToolRail } from './ToolRail';
import { Workspace } from './Workspace';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';

/** The app window. The tab strip appears only when there are multiple open
 * projects, matching GeoCarto's quieter one-document chrome. */
export function AppShell() {
  const openTabCount = useWorkspaceStore((s) => s.openTabIds.length);
  const showTabs = openTabCount > 1;
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-full w-full items-stretch p-3">
      <GlassPanel
        strong
        className="window-anim grid h-full w-full overflow-hidden rounded-[var(--calqo-radius-window)]"
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

        <StatusBar onOpenSettings={() => setSettingsOpen(true)} />
      </GlassPanel>
      <AppSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
