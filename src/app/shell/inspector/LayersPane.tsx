import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Folder,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Lock,
  Shapes,
  Square,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import {
  deleteSelectedLayers,
  duplicateSelectedLayers,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import { GlassIconButton } from '@/components/glass';
import { useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import type { CalqoLayer } from '@/lib/schema';
import { cn } from '@/lib/utils/cn';

const LAYER_ICON = {
  text: Type,
  shape: Square,
  image: ImageIcon,
  svg: Shapes,
  group: Folder,
} as const;

/** Active artboard + layer tree. Reorder/grouping stay in Phase C. */
export function LayersPane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = project?.artboards[0];
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);

  return (
    <div className="flex flex-col gap-4">
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
                  {ab.width}x{ab.height}
                </span>
              </div>
            ))
          ) : (
            <p className="px-2 py-1 text-[12px] text-[var(--calqo-text-3)]">-</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Layers size={13} className="text-[var(--calqo-text-3)]" />
            <span className="eyebrow">{t('panels.layers')}</span>
          </span>
          {project && selectedIds.length > 0 && (
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-[var(--calqo-radius-xs)] px-1.5 py-1 text-[10.5px] text-[var(--calqo-text-3)] hover:bg-[var(--calqo-hover)]"
                onClick={() => duplicateSelectedLayers(project.id)}
              >
                {t('layersPanel.duplicate')}
              </button>
              <GlassIconButton
                label={t('layersPanel.deleteSelected')}
                size={24}
                onClick={() => deleteSelectedLayers(project.id)}
              >
                <Trash2 size={13} />
              </GlassIconButton>
            </span>
          )}
        </div>
        <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">
          {project && artboard && artboard.layers.length > 0 ? (
            artboard.layers
              .slice()
              .reverse()
              .map((layer) => (
                <LayerRow
                  key={layer.id}
                  projectId={project.id}
                  layer={layer}
                  selected={selectedIds.includes(layer.id)}
                />
              ))
          ) : (
            <p className="px-2 py-1 text-[12px] text-[var(--calqo-text-3)]">-</p>
          )}
        </div>
      </section>
    </div>
  );
}

function LayerRow({
  projectId,
  layer,
  selected,
}: {
  projectId: string;
  layer: CalqoLayer;
  selected: boolean;
}) {
  const { t } = useTranslation('editor');
  const Icon = LAYER_ICON[layer.type];
  const selectOne = useSelectionStore((s) => s.selectOne);
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-[var(--calqo-radius-xs)] px-2 py-1.5 text-[12px]',
        selected
          ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
          : 'hover:bg-[var(--calqo-hover)]',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => selectOne(layer.id)}
      >
        <Icon size={13} className="shrink-0 text-current opacity-75" />
        <span className="truncate">{layer.name}</span>
      </button>
      <button
        type="button"
        className="text-[var(--calqo-text-3)] opacity-70 hover:text-[var(--calqo-text)]"
        title={layer.visible ? t('layersPanel.hide') : t('layersPanel.show')}
        onClick={() =>
          updateLayerInActiveArtboard(projectId, layer.id, {
            visible: !layer.visible,
          })
        }
      >
        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button
        type="button"
        className="text-[var(--calqo-text-3)] opacity-70 hover:text-[var(--calqo-text)]"
        title={layer.locked ? t('layersPanel.unlock') : t('layersPanel.lock')}
        onClick={() =>
          updateLayerInActiveArtboard(projectId, layer.id, {
            locked: !layer.locked,
          })
        }
      >
        {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
      </button>
    </div>
  );
}
