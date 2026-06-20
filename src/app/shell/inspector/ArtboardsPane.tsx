import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Copy, GripVertical, LayoutGrid, Plus, Trash2, X } from 'lucide-react';
import {
  addArtboard,
  artboardOverflowLayerIds,
  deleteArtboard,
  duplicateArtboard,
  renameArtboard,
  reorderArtboard,
  setActiveArtboard,
} from '@/editor/commands/projectCommands';
import { GlassIconButton } from '@/components/glass';
import { ARTBOARD_PRESET_LIST, type ArtboardPresetId } from '@/lib/schema/presets';
import { useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import type { CalqoArtboard } from '@/lib/schema';
import { cn } from '@/lib/utils/cn';

/** Artboard manager: create from preset, reorder, rename, duplicate (incl.
 * duplicate-to-preset), delete, and set the active artboard (plan §C4/C5). */
export function ArtboardsPane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  const [adding, setAdding] = useState(false);
  // Set after a duplicate-to-preset; drives the post-resize review banner.
  const [reviewId, setReviewId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (!project) return null;
  const artboards = project.artboards;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = artboards.findIndex((ab) => ab.id === active.id);
    const to = artboards.findIndex((ab) => ab.id === over.id);
    if (from >= 0 && to >= 0) reorderArtboard(project.id, from, to);
  };

  const handleDuplicate = (sourceId: string, preset?: ArtboardPresetId) => {
    const newId = duplicateArtboard(project.id, sourceId, preset);
    // Only a resize can push layers out of bounds — review those.
    setReviewId(preset && newId ? newId : null);
  };

  const reviewArtboard = reviewId
    ? artboards.find((ab) => ab.id === reviewId) ?? null
    : null;
  const reviewOverflow = reviewArtboard
    ? artboardOverflowLayerIds(reviewArtboard).length
    : 0;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <LayoutGrid size={13} className="text-[var(--calqo-text-3)]" />
          <span className="eyebrow">{t('panels.artboards')}</span>
        </span>
        <GlassIconButton
          label={t('artboards.add')}
          size={24}
          active={adding}
          onClick={() => setAdding((open) => !open)}
        >
          <Plus size={14} />
        </GlassIconButton>
      </div>

      {adding && (
        <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] p-2">
          {ARTBOARD_PRESET_LIST.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="rounded-[8px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--calqo-hover)]"
              onClick={() => {
                addArtboard(project.id, preset.id as ArtboardPresetId);
                setAdding(false);
              }}
            >
              <span className="block truncate font-semibold text-[var(--calqo-text)]">
                {preset.name}
              </span>
              <span className="mono block text-[9.5px] text-[var(--calqo-text-3)]">
                {preset.width} x {preset.height}
              </span>
            </button>
          ))}
        </div>
      )}

      {reviewArtboard && reviewOverflow > 0 && (
        <div className="mb-2 flex items-start gap-2 rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-2.5 py-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#B7791F]" />
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-[11px] text-[var(--calqo-text-2)]"
            onClick={() => setActiveArtboard(reviewArtboard.id)}
          >
            {t('artboards.resizeReview', {
              name: reviewArtboard.name,
              count: reviewOverflow,
            })}
          </button>
          <button
            type="button"
            aria-label={t('artboards.dismissReview')}
            className="shrink-0 text-[var(--calqo-text-3)] hover:text-[var(--calqo-text)]"
            onClick={() => setReviewId(null)}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={artboards.map((ab) => ab.id)}
            strategy={verticalListSortingStrategy}
          >
            {artboards.map((artboard) => (
              <ArtboardRow
                key={artboard.id}
                projectId={project.id}
                artboard={artboard}
                active={artboard.id === activeArtboardId}
                canDelete={artboards.length > 1}
                onDuplicate={handleDuplicate}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </section>
  );
}

function ArtboardRow({
  projectId,
  artboard,
  active,
  canDelete,
  onDuplicate,
}: {
  projectId: string;
  artboard: CalqoArtboard;
  active: boolean;
  canDelete: boolean;
  onDuplicate: (sourceId: string, preset?: ArtboardPresetId) => void;
}) {
  const { t } = useTranslation('editor');
  const [renaming, setRenaming] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: artboard.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group rounded-[var(--calqo-radius-xs)]',
        isDragging && 'opacity-60',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-[var(--calqo-radius-xs)] px-1.5 py-1.5 text-[12px]',
          active
            ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
            : 'hover:bg-[var(--calqo-hover)]',
        )}
      >
        <button
          type="button"
          aria-label={t('layersPanel.reorder')}
          className="cursor-grab text-[var(--calqo-text-3)] opacity-0 group-hover:opacity-70"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>
        {renaming ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={artboard.name}
            className="min-w-0 flex-1 rounded-[6px] border border-[var(--calqo-accent)] bg-[var(--calqo-glass)] px-1.5 py-0.5 text-[12px] text-[var(--calqo-text)] outline-none"
            onBlur={(event) => {
              renameArtboard(projectId, artboard.id, event.target.value);
              setRenaming(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => setActiveArtboard(artboard.id)}
            onDoubleClick={() => setRenaming(true)}
          >
            {artboard.name}
          </button>
        )}
        <span className="mono shrink-0 text-[9.5px] text-[var(--calqo-text-3)]">
          {artboard.width}x{artboard.height}
        </span>
        <button
          type="button"
          title={t('artboards.duplicateToPreset')}
          className="text-[var(--calqo-text-3)] opacity-0 hover:text-[var(--calqo-text)] group-hover:opacity-70"
          onClick={() => setPresetOpen((open) => !open)}
        >
          <Copy size={13} />
        </button>
        {canDelete && (
          <button
            type="button"
            title={t('artboards.delete')}
            className="text-[var(--calqo-text-3)] opacity-0 hover:text-[#FF3B30] group-hover:opacity-70"
            onClick={() => deleteArtboard(projectId, artboard.id)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {presetOpen && (
        <div className="mt-1 mb-1 ml-5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] p-1.5">
          <p className="mb-1.5 px-1 text-[10.5px] text-[var(--calqo-text-3)]">
            {t('artboards.duplicateToPreset')}
          </p>
          <button
            type="button"
            className="mb-1 w-full rounded-[6px] px-2 py-1 text-left text-[11px] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)]"
            onClick={() => {
              onDuplicate(artboard.id);
              setPresetOpen(false);
            }}
          >
            {t('artboards.duplicateSameSize')}
          </button>
          <div className="grid grid-cols-2 gap-1">
            {ARTBOARD_PRESET_LIST.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-[6px] px-2 py-1 text-left text-[10.5px] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)]"
                onClick={() => {
                  onDuplicate(artboard.id, preset.id as ArtboardPresetId);
                  setPresetOpen(false);
                }}
              >
                <span className="block truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
