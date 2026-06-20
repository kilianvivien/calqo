import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  deleteSelectedLayers,
  reorderTopLevelLayer,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import { layerLabel } from '@/editor/utils/layers';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { BottomSheet } from '@/components/mobile';
import { cn } from '@/lib/utils/cn';

interface LayersSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
  artboard: CalqoArtboard;
}

/** Simple layer list for the phone: select, show/hide, reorder, and delete the
 * artboard's top-level layers (PRD §5.9 "basic layer actions"). Shown top of
 * the stack first, matching how layers read on the canvas. */
export function LayersSheet({ open, onClose, project, artboard }: LayersSheetProps) {
  const { t } = useTranslation('editor');
  const selectedLayerIds = useSelectionStore((s) => s.selectedLayerIds);
  const selectOne = useSelectionStore((s) => s.selectOne);

  const count = artboard.layers.length;
  // Top-of-stack (highest index) first for display.
  const rows = artboard.layers.map((layer, index) => ({ layer, index })).reverse();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('panels.layers')}
      bodyClassName="pb-4"
    >
      {count === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-[var(--calqo-text-3)]">
          {t('mobile.layers.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map(({ layer, index }) => {
            const selected = selectedLayerIds.includes(layer.id);
            return (
              <li
                key={layer.id}
                className={cn(
                  'flex items-center gap-1 rounded-[var(--calqo-radius-sm)] border px-1.5 py-1.5',
                  selected
                    ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)]'
                    : 'border-[var(--calqo-divider)]',
                )}
              >
                <button
                  type="button"
                  aria-label={layer.visible ? t('mobile.layers.hide') : t('mobile.layers.show')}
                  onClick={() =>
                    updateLayerInActiveArtboard(
                      project.id,
                      layer.id,
                      { visible: !layer.visible },
                      { undoable: true },
                    )
                  }
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] active:bg-[var(--calqo-hover)]"
                >
                  {layer.visible ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectOne(layer.id);
                    onClose();
                  }}
                  className="min-w-0 flex-1 truncate py-2 text-left text-[13.5px] text-[var(--calqo-text)]"
                >
                  {layerLabel(layer)}
                </button>
                <button
                  type="button"
                  aria-label={t('mobile.layers.forward')}
                  disabled={index === count - 1}
                  onClick={() => reorderTopLevelLayer(project.id, index, index + 1)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] active:bg-[var(--calqo-hover)] disabled:opacity-30"
                >
                  <ChevronUp size={17} />
                </button>
                <button
                  type="button"
                  aria-label={t('mobile.layers.backward')}
                  disabled={index === 0}
                  onClick={() => reorderTopLevelLayer(project.id, index, index - 1)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] active:bg-[var(--calqo-hover)] disabled:opacity-30"
                >
                  <ChevronDown size={17} />
                </button>
                <button
                  type="button"
                  aria-label={t('mobile.layers.delete')}
                  onClick={() => {
                    selectOne(layer.id);
                    deleteSelectedLayers(project.id);
                  }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] active:bg-[var(--calqo-hover)]"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
