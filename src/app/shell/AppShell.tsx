import { GlassPanel } from '@/components/glass';
import { TitleBar } from './TitleBar';
import { TabBar } from './TabBar';
import { ToolRail } from './ToolRail';
import { LeftPanel } from './LeftPanel';
import { Workspace } from './Workspace';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';

/** The app window: a single rounded glass container holding the three-row grid
 * (title bar / workspace / status bar), mirroring the GeoCarto layout. */
export function AppShell() {
  return (
    <div className="flex h-full w-full items-stretch p-3">
      <GlassPanel
        strong
        className="window-anim grid h-full w-full overflow-hidden rounded-[var(--calqo-radius-window)]"
        style={{ gridTemplateRows: '44px 36px 1fr 28px' }}
      >
        <TitleBar />
        <TabBar />

        <div
          className="grid min-h-0"
          style={{ gridTemplateColumns: '60px 240px 1fr 300px' }}
        >
          <div className="border-r border-[var(--calqo-divider)]">
            <ToolRail />
          </div>
          <div className="min-h-0 p-2">
            <LeftPanel />
          </div>
          <div className="min-h-0 p-2">
            <Workspace />
          </div>
          <div className="min-h-0 p-2">
            <Inspector />
          </div>
        </div>

        <StatusBar />
      </GlassPanel>
    </div>
  );
}
