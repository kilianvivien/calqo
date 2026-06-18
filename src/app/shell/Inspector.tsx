import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, Layers, Palette } from 'lucide-react';
import { GlassPanel } from '@/components/glass';
import { cn } from '@/lib/utils/cn';

type PaneId = 'properties' | 'layers' | 'style';

/** Right inspector — three-tab panel with a persistent header. Panes are
 * placeholders until the editor and content tools land. */
export function Inspector() {
  const { t } = useTranslation('editor');
  const [pane, setPane] = useState<PaneId>('properties');

  const tabs: { id: PaneId; icon: typeof Layers; label: string }[] = [
    { id: 'properties', icon: SlidersHorizontal, label: t('panels.properties') },
    { id: 'layers', icon: Layers, label: t('panels.layers') },
    { id: 'style', icon: Palette, label: t('panels.style') },
  ];

  return (
    <GlassPanel animate className="flex h-full w-full flex-col overflow-hidden">
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

      <div className="flex-1 overflow-y-auto calqo-scroll p-4 text-[12px] text-[var(--calqo-text-3)]">
        {t('workspace.empty')}
      </div>
    </GlassPanel>
  );
}
