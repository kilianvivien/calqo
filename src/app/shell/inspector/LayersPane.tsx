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
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  Group as GroupIcon,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Lock,
  Shapes,
  Square,
  Trash2,
  Type,
  Ungroup,
  Unlock,
} from 'lucide-react';
import {
  deleteSelectedLayers,
  duplicateSelectedLayers,
  groupSelectedLayers,
  setGroupExpanded,
  ungroupLayer,
  updateLayerInActiveArtboard,
  renameLayer,
  reorderTopLevelLayer,
} from '@/editor/commands/projectCommands';
import { GlassIconButton } from '@/components/glass';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { isGroupLayer } from '@/editor/utils/layers';
import type { CalqoLayer } from '@/lib/schema';
import { ArtboardsPane } from './ArtboardsPane';
import { cn } from '@/lib/utils/cn';

const LAYER_ICON = {
  text: Type,
  shape: Square,
  image: ImageIcon,
  svg: Shapes,
  group: Folder,
} as const;

/** Active artboard + layer tree: reorder, rename, visibility, lock, and
 * group/ungroup (plan §C1–C3). */
export function LayersPane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Layers are displayed front-to-back (top of panel = front of canvas), i.e.
  // the reverse of the document array.
  const topLevel = artboard?.layers ?? [];
  const displayOrder = topLevel.slice().reverse();

  const selectedTop = topLevel.filter((layer) => selectedIds.includes(layer.id));
  const canGroup = selectedTop.length >= 2;
  const selectedGroup =
    selectedTop.length === 1 && isGroupLayer(selectedTop[0]) ? selectedTop[0] : null;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!project || !over || active.id === over.id) return;
    // Map display (reversed) indices back to document indices.
    const fromDisplay = displayOrder.findIndex((l) => l.id === active.id);
    const toDisplay = displayOrder.findIndex((l) => l.id === over.id);
    if (fromDisplay < 0 || toDisplay < 0) return;
    const last = topLevel.length - 1;
    reorderTopLevelLayer(project.id, last - fromDisplay, last - toDisplay);
  };

  return (
    <div className="flex flex-col gap-4">
      <ArtboardsPane />

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Layers size={13} className="text-[var(--calqo-text-3)]" />
            <span className="eyebrow">{t('panels.layers')}</span>
          </span>
          {project && (
            <span className="flex items-center gap-1">
              {canGroup && (
                <GlassIconButton
                  label={t('layersPanel.group')}
                  size={24}
                  onClick={() => groupSelectedLayers(project.id)}
                >
                  <GroupIcon size={13} />
                </GlassIconButton>
              )}
              {selectedGroup && (
                <GlassIconButton
                  label={t('layersPanel.ungroup')}
                  size={24}
                  onClick={() => ungroupLayer(project.id, selectedGroup.id)}
                >
                  <Ungroup size={13} />
                </GlassIconButton>
              )}
              {selectedTop.length > 0 && (
                <>
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
                </>
              )}
            </span>
          )}
        </div>
        <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">
          {project && artboard && displayOrder.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={displayOrder.map((layer) => layer.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayOrder.map((layer) => (
                  <SortableLayerRow
                    key={layer.id}
                    projectId={project.id}
                    layer={layer}
                    depth={0}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <p className="px-2 py-1 text-[12px] text-[var(--calqo-text-3)]">-</p>
          )}
        </div>
      </section>
    </div>
  );
}

/** A draggable top-level row (with its non-draggable group children beneath). */
function SortableLayerRow({
  projectId,
  layer,
  depth,
}: {
  projectId: string;
  layer: CalqoLayer;
  depth: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: layer.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-60')}
    >
      <LayerRow
        projectId={projectId}
        layer={layer}
        depth={depth}
        dragHandle={listeners ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

function LayerRow({
  projectId,
  layer,
  depth,
  dragHandle,
}: {
  projectId: string;
  layer: CalqoLayer;
  depth: number;
  dragHandle?: Record<string, unknown>;
}) {
  const { t } = useTranslation('editor');
  const Icon = LAYER_ICON[layer.type];
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);
  const selectOne = useSelectionStore((s) => s.selectOne);
  const toggleSelection = useSelectionStore((s) => s.toggleSelection);
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = selectedIds.includes(layer.id);
  const group = isGroupLayer(layer) ? layer : null;
  const expanded = group?.expanded ?? false;

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-1.5 rounded-[var(--calqo-radius-xs)] py-1.5 pr-2 text-[12px]',
          selected
            ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
            : 'hover:bg-[var(--calqo-hover)]',
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {dragHandle ? (
          <button
            type="button"
            aria-label={t('layersPanel.reorder')}
            className="cursor-grab text-[var(--calqo-text-3)] opacity-0 group-hover:opacity-70"
            {...dragHandle}
          >
            <GripVertical size={13} />
          </button>
        ) : (
          <span className="w-[13px]" />
        )}
        {group ? (
          <button
            type="button"
            aria-label={expanded ? t('layersPanel.collapse') : t('layersPanel.expand')}
            className="shrink-0 text-[var(--calqo-text-3)] hover:text-[var(--calqo-text)]"
            onClick={() => setGroupExpanded(projectId, group.id, !expanded)}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        {renaming ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={layer.name}
            className="min-w-0 flex-1 rounded-[6px] border border-[var(--calqo-accent)] bg-[var(--calqo-glass)] px-1.5 py-0.5 text-[12px] text-[var(--calqo-text)] outline-none"
            onBlur={(event) => {
              renameLayer(projectId, layer.id, event.target.value);
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
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={(event) => {
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                toggleSelection(layer.id);
              } else {
                selectOne(layer.id);
              }
            }}
            onDoubleClick={() => setRenaming(true)}
          >
            <Icon size={13} className="shrink-0 text-current opacity-75" />
            <span className="truncate">{layer.name}</span>
          </button>
        )}
        <button
          type="button"
          className="text-[var(--calqo-text-3)] opacity-70 hover:text-[var(--calqo-text)]"
          title={layer.visible ? t('layersPanel.hide') : t('layersPanel.show')}
          onClick={() =>
            updateLayerInActiveArtboard(projectId, layer.id, { visible: !layer.visible })
          }
        >
          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          type="button"
          className="text-[var(--calqo-text-3)] opacity-70 hover:text-[var(--calqo-text)]"
          title={layer.locked ? t('layersPanel.unlock') : t('layersPanel.lock')}
          onClick={() =>
            updateLayerInActiveArtboard(projectId, layer.id, { locked: !layer.locked })
          }
        >
          {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
      </div>
      {group && expanded &&
        group.children
          .slice()
          .reverse()
          .map((child) => (
            <LayerRow
              key={child.id}
              projectId={projectId}
              layer={child}
              depth={depth + 1}
            />
          ))}
    </>
  );
}
