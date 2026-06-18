import { useTranslation } from 'react-i18next';
import { Layers, LayoutGrid, Type, Square, Image as ImageIcon, Shapes, Folder } from 'lucide-react';
import { GlassPanel } from '@/components/glass';
import { useActiveProject } from '@/lib/state/selectors';
import type { CalqoLayer } from '@/lib/schema';

const LAYER_ICON = {
  text: Type,
  shape: Square,
  image: ImageIcon,
  svg: Shapes,
  group: Folder,
} as const;

/** Left dock: layers tree + artboards list. Reflects the active project document
 * (read-only until the canvas editor and layer ops land in Phases B–C). */
export function LeftPanel() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = project?.artboards[0];

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
        <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">
          {artboard && artboard.layers.length > 0 ? (
            [...artboard.layers]
              .slice()
              .reverse()
              .map((layer) => <LayerRow key={layer.id} layer={layer} />)
          ) : (
            <p className="px-2 py-1 text-[12px] text-[var(--calqo-text-3)]">—</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <LayoutGrid size={13} className="text-[var(--calqo-text-3)]" />
          <span className="eyebrow">{t('panels.artboards')}</span>
        </div>
        <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">
          {project ? (
            project.artboards.map((ab) => (
              <div
                key={ab.id}
                className="flex items-center justify-between rounded-[var(--calqo-radius-xs)] px-2 py-1.5 text-[12px] hover:bg-[var(--calqo-hover)]"
              >
                <span className="truncate text-[var(--calqo-text-2)]">{ab.name}</span>
                <span className="mono text-[10px] text-[var(--calqo-text-3)]">
                  {ab.width}×{ab.height}
                </span>
              </div>
            ))
          ) : (
            <p className="px-2 py-1 text-[12px] text-[var(--calqo-text-3)]">—</p>
          )}
        </div>
      </section>
    </GlassPanel>
  );
}

function LayerRow({ layer }: { layer: CalqoLayer }) {
  const Icon = LAYER_ICON[layer.type];
  return (
    <div className="flex items-center gap-2 rounded-[var(--calqo-radius-xs)] px-2 py-1.5 text-[12px] hover:bg-[var(--calqo-hover)]">
      <Icon size={13} className="text-[var(--calqo-text-3)]" />
      <span className="truncate text-[var(--calqo-text-2)]">{layer.name}</span>
    </div>
  );
}
