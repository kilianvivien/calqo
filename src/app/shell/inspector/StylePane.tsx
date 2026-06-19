import { useTranslation } from 'react-i18next';
import { Brush, PaintBucket, Plus, Trash2 } from 'lucide-react';
import { editProject } from '@/editor/commands/projectCommands';
import { updateLayer } from '@/editor/utils/layers';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import type { CalqoLayer } from '@/lib/schema';
import { DocumentControls } from './PropertiesPane';
import { ColorSwatchButton } from './ColorSwatchButton';
import { ContentLocalesSection } from './ContentControls';

/** Project-level style: artboard setup, background, and brand palette. */
export function StylePane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);
  const setShapeDefaults = useUiStore((s) => s.setShapeDefaults);

  if (!project || !artboard) {
    return (
      <p className="text-[12px] text-[var(--calqo-text-3)]">{t('workspace.empty')}</p>
    );
  }

  const updatePaletteColor = (index: number, color: string) => {
    editProject(project.id, (draft) => {
      draft.palette[index] = color;
    });
  };

  const addPaletteColor = () => {
    editProject(project.id, (draft) => {
      draft.palette.push('#007AFF');
    });
  };

  const removePaletteColor = (index: number) => {
    editProject(project.id, (draft) => {
      draft.palette.splice(index, 1);
    });
  };

  const setBackground = (color: string) => {
    editProject(
      project.id,
      (draft) => {
        const target = draft.artboards.find((candidate) => candidate.id === artboard.id);
        if (target) target.background = { type: 'solid', color };
      },
      { undoable: true },
    );
  };

  const applyColor = (color: string) => {
    setShapeDefaults({ fill: color, stroke: color });
    if (selectedIds.length === 0) return;
    editProject(
      project.id,
      (draft) => {
        const target = draft.artboards.find((candidate) => candidate.id === artboard.id);
        if (!target) return;
        selectedIds.forEach((id) => {
          updateLayer(target.layers as CalqoLayer[], id, (layer) => {
            if (layer.type === 'shape') {
              layer.fill = { type: 'solid', color };
              layer.stroke = { color, width: layer.stroke?.width ?? 2 };
            }
            if (layer.type === 'text') layer.style.color = color;
          });
        });
      },
      { undoable: true },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <DocumentControls />

      <section>
        <div className="mb-2">
          <span className="eyebrow">{t('palette.title')}</span>
        </div>
        <div className="glass-thin space-y-1.5 rounded-[var(--calqo-radius-sm)] p-2">
          {project.palette.map((color, i) => {
            const applyLabel =
              selectedIds.length > 0 ? t('palette.apply') : t('palette.defaults');
            return (
              <div key={`${color}-${i}`} className="flex items-center gap-1.5">
                <ColorSwatchButton
                  value={color}
                  onChange={(next) => updatePaletteColor(i, next)}
                  label={`${t('palette.title')} ${i + 1}`}
                  size={26}
                />
                <span className="mono min-w-0 flex-1 truncate text-[11px] uppercase tracking-wide text-[var(--calqo-text-2)]">
                  {color}
                </span>
                <button
                  type="button"
                  title={applyLabel}
                  aria-label={applyLabel}
                  onClick={() => applyColor(color)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
                >
                  <Brush size={13} />
                </button>
                <button
                  type="button"
                  title={t('palette.background')}
                  aria-label={t('palette.background')}
                  onClick={() => setBackground(color)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
                >
                  <PaintBucket size={13} />
                </button>
                <button
                  type="button"
                  title={t('palette.remove')}
                  aria-label={t('palette.remove')}
                  onClick={() => removePaletteColor(i)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-3)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addPaletteColor}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-dashed border-[var(--calqo-divider)] text-[12px] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)]"
          >
            <Plus size={13} />
            {t('palette.add')}
          </button>
        </div>
      </section>

      <ContentLocalesSection />
    </div>
  );
}
