import { GlassPanel } from '@/components/glass';
import { TitleBar } from './TitleBar';
import { TabBar } from './TabBar';
import { ToolRail } from './ToolRail';
import { Workspace } from './Workspace';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';

/** The app window: a single rounded glass container holding the four-row grid
 * (title bar / tab bar / workspace / status bar). The workspace row is a
 * three-column layout — tool rail · canvas · inspector — matching GeoCarto. */
export function AppShell() {
  return (
    <div className="flex h-full w-full items-stretch p-3">
      <GlassPanel
        strong
        className="window-anim grid h-full w-full overflow-hidden rounded-[var(--calqo-radius-window)]"
        style={{ gridTemplateRows: '44px 36px minmax(0, 1fr) 28px' }}
      >
        <TitleBar />
        <TabBar />

        <div className="grid min-h-0 grid-cols-[auto_1fr_auto]">
          <ToolRail />
          <div className="relative min-h-0 min-w-0">
            <Workspace />
          </div>
          <Inspector />
        </div>

        <StatusBar />
      </GlassPanel>
    </div>
  );
}
