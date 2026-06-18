import { useTranslation } from 'react-i18next';
import { Layers, LayoutGrid } from 'lucide-react';
import { GlassPanel } from '@/components/glass';

/** Left dock: layers tree + artboards list (placeholder shells for Phase C). */
export function LeftPanel() {
  const { t } = useTranslation('editor');

  return (
    <GlassPanel
      animate
      className="flex h-full w-full flex-col gap-4 overflow-y-auto calqo-scroll p-3"
    >
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Layers size={13} className="text-[var(--calqo-text-3)]" />
          <span className="eyebrow">{t('panels.layers')}</span>
        </div>
        <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-2 text-[12px] text-[var(--calqo-text-3)]">
          —
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <LayoutGrid size={13} className="text-[var(--calqo-text-3)]" />
          <span className="eyebrow">{t('panels.artboards')}</span>
        </div>
        <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-2 text-[12px] text-[var(--calqo-text-3)]">
          —
        </div>
      </section>
    </GlassPanel>
  );
}
