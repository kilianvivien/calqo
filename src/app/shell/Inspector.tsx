import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SlidersHorizontal,
  Layers,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { PropertiesPane } from './inspector/PropertiesPane';
import { LayersPane } from './inspector/LayersPane';
import { StylePane } from './inspector/StylePane';

type PaneId = 'properties' | 'layers' | 'style';

/** The single right-hand inspector (GeoCarto §4.4): a 3-tab panel with a
 * persistent header. Layers + artboards live in the Layers tab — there is no
 * separate left dock. Diagnostics lives in the Settings modal. */
export function Inspector() {
  const { t } = useTranslation('editor');
  const [pane, setPane] = useState<PaneId>('properties');

  const tabs: { id: PaneId; icon: LucideIcon; label: string }[] = [
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
      </div>
    </aside>
  );
}
