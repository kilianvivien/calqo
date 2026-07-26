import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clapperboard,
  SlidersHorizontal,
  Layers,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { PropertiesPane } from './inspector/PropertiesPane';
import { LayersPane } from './inspector/LayersPane';
import { StylePane } from './inspector/StylePane';
import { AnimationInspector } from './animation/AnimationInspector';

type PaneId = 'properties' | 'layers' | 'style' | 'animate';

/** The single right-hand inspector (GeoCarto §4.4): a 3-tab panel with a
 * persistent header. In Animate mode the Properties/Style tabs are replaced by
 * an Animation tab (§6.1); Layers stays available in both modes. */
export function Inspector() {
  const { t } = useTranslation('editor');
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const animate = useWorkspaceStore(
    (s) => (activeProjectId ? (s.modeByProject[activeProjectId] ?? 'design') : 'design') === 'animate',
  );
  const [pane, setPane] = useState<PaneId>('properties');

  // Keep the active tab valid when switching modes: Design defaults to
  // Properties, Animate defaults to the Animation tab.
  useEffect(() => {
    setPane((current) => {
      if (animate) return current === 'layers' ? current : 'animate';
      return current === 'layers' ? current : 'properties';
    });
  }, [animate]);

  const tabs: { id: PaneId; icon: LucideIcon; label: string }[] = animate
    ? [
        { id: 'animate', icon: Clapperboard, label: t('animate.inspector.title') },
        { id: 'layers', icon: Layers, label: t('panels.layers') },
      ]
    : [
        { id: 'properties', icon: SlidersHorizontal, label: t('panels.properties') },
        { id: 'layers', icon: Layers, label: t('panels.layers') },
        { id: 'style', icon: Palette, label: t('panels.style') },
      ];

  return (
    <aside className="glass panel-anim m-1.5 flex w-[340px] flex-col overflow-hidden">
      <div
        role="tablist"
        aria-label={t('panels.inspector')}
        className="flex gap-1 border-b border-[var(--calqo-divider)] p-2"
      >
        {tabs.map(({ id, icon: Icon, label }) => {
          const active = id === pane;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setPane(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] py-1.5 text-[12px]',
                'transition-colors duration-[var(--calqo-t-fast)]',
                active
                  ? 'bg-[var(--calqo-accent-soft)] font-semibold text-[var(--calqo-accent)] outline outline-[0.5px] outline-[var(--calqo-accent-ring)]'
                  : 'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="flex-1 overflow-y-auto calqo-scroll p-4">
        {pane === 'properties' && <PropertiesPane />}
        {pane === 'layers' && <LayersPane />}
        {pane === 'style' && <StylePane />}
        {pane === 'animate' && <AnimationInspector />}
      </div>
    </aside>
  );
}
