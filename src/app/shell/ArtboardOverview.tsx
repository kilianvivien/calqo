import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, X } from 'lucide-react';
import {
  addArtboard,
  deleteArtboard,
  duplicateArtboard,
  renameArtboard,
  reorderArtboard,
  resizeArtboard,
  setActiveArtboard,
} from '@/editor/commands/projectCommands';
import { ArtboardThumbnail } from '@/editor/canvas/ArtboardThumbnail';
import { GlassIconButton } from '@/components/glass';
import { ARTBOARD_PRESET_LIST, type ArtboardPresetId } from '@/lib/schema/presets';
import { useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { cn } from '@/lib/utils/cn';

/** Height of each tile's preview area; the thumbnail fits within tile-width × this. */
const PREVIEW_HEIGHT = 168;

/** Open context menu: which artboard, anchored at these container-relative px. */
interface MenuState {
  artboardId: string;
  x: number;
  y: number;
}

/** "See all" overview: a Figma-like grid of every artboard in the project,
 * shown as a full-canvas overlay. Single-click highlights a tile (and reveals
 * duplicate/delete); double-click focuses it and returns to the editor. Tiles
 * can be reordered by drag-and-drop, and a right-click menu offers rename,
 * change-format, duplicate and delete. */
export function ArtboardOverview() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const overviewMode = useUiStore((s) => s.overviewMode);
  const setOverviewMode = useUiStore((s) => s.setOverviewMode);
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Mount/animation state: keep the overlay rendered through its exit transition
  // so entering reads as a "zoom out" and exiting as a "zoom in".
  const [mounted, setMounted] = useState(overviewMode);
  const [entered, setEntered] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    if (overviewMode) {
      setMounted(true);
      // Double rAF: let the browser paint the scaled-in start state once before
      // flipping to the settled state, otherwise the enter transition is skipped.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(timer);
  }, [overviewMode]);

  useEffect(() => {
    if (!overviewMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Close the menu first, then the overview, so Esc is layered.
        setMenu((open) => {
          if (open) return null;
          setOverviewMode(false);
          return null;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overviewMode, setOverviewMode]);

  // Reset transient UI whenever the overview closes.
  useEffect(() => {
    if (!overviewMode) {
      setMenu(null);
      setRenamingId(null);
    }
  }, [overviewMode]);

  if (!mounted || !project) return null;

  const focus = (id: string) => {
    setActiveArtboard(id);
    setOverviewMode(false);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = project.artboards.findIndex((ab) => ab.id === active.id);
    const to = project.artboards.findIndex((ab) => ab.id === over.id);
    if (from >= 0 && to >= 0) reorderArtboard(project.id, from, to);
  };

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex origin-center flex-col transition-[opacity,scale] duration-[var(--calqo-t-base)] ease-[var(--calqo-ease-out)] motion-reduce:transition-none',
        entered ? 'scale-100 opacity-100' : 'scale-[1.06] opacity-0',
        overviewMode ? '' : 'pointer-events-none',
      )}
      style={{ background: 'var(--calqo-workspace)' }}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-5 py-3">
        <span className="eyebrow">{t('overview.title')}</span>
        <GlassIconButton
          label={t('overview.exit')}
          size={26}
          onClick={() => setOverviewMode(false)}
        >
          <X size={15} />
        </GlassIconButton>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={project.artboards.map((ab) => ab.id)}
            strategy={rectSortingStrategy}
          >
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              }}
            >
              {project.artboards.map((artboard, index) => (
                <ArtboardTile
                  key={artboard.id}
                  project={project}
                  artboard={artboard}
                  index={index}
                  active={artboard.id === activeArtboardId}
                  renaming={renamingId === artboard.id}
                  onSelect={() => setActiveArtboard(artboard.id)}
                  onFocus={() => focus(artboard.id)}
                  onStartRename={() => setRenamingId(artboard.id)}
                  onEndRename={() => setRenamingId(null)}
                  onContextMenu={(x, y) => {
                    setActiveArtboard(artboard.id);
                    setMenu({ artboardId: artboard.id, x, y });
                  }}
                />
              ))}
              <AddTile
                label={t('overview.addPage')}
                onClick={() => addArtboard(project.id)}
              />
            </div>
          </SortableContext>
        </DndContext>

        {menu && (
          <ArtboardContextMenu
            project={project}
            artboardId={menu.artboardId}
            x={menu.x}
            y={menu.y}
            canDelete={project.artboards.length > 1}
            onRename={() => setRenamingId(menu.artboardId)}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </div>
  );
}

function ArtboardTile({
  project,
  artboard,
  index,
  active,
  renaming,
  onSelect,
  onFocus,
  onStartRename,
  onEndRename,
  onContextMenu,
}: {
  project: CalqoProject;
  artboard: CalqoArtboard;
  index: number;
  active: boolean;
  renaming: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onStartRename: () => void;
  onEndRename: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: artboard.id });

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setBoxWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex flex-col gap-1.5', isDragging && 'z-10 opacity-70')}
    >
      <button
        type="button"
        aria-label={artboard.name}
        onClick={onSelect}
        onDoubleClick={onFocus}
        onContextMenu={(event) => {
          event.preventDefault();
          // Anchor to the scroll container so the menu clamps correctly.
          const host = event.currentTarget.closest('.overflow-y-auto');
          const rect = host?.getBoundingClientRect();
          onContextMenu(
            event.clientX - (rect?.left ?? 0) + (host?.scrollLeft ?? 0),
            event.clientY - (rect?.top ?? 0) + (host?.scrollTop ?? 0),
          );
        }}
        {...attributes}
        {...listeners}
        className={cn(
          'relative flex cursor-pointer touch-none items-center justify-center overflow-hidden rounded-[var(--calqo-radius-md)] border bg-[var(--calqo-glass-thin)] transition-all duration-[var(--calqo-t-fast)]',
          active
            ? 'border-[var(--calqo-accent)] ring-2 ring-[var(--calqo-accent)]'
            : 'border-[var(--calqo-divider)] hover:border-[var(--calqo-text-3)]',
        )}
        style={{ height: PREVIEW_HEIGHT }}
      >
        <div
          ref={previewRef}
          className="flex h-full w-full items-center justify-center p-3"
        >
          {boxWidth > 0 && (
            <ArtboardThumbnail
              project={project}
              artboard={artboard}
              maxWidth={boxWidth - 24}
              maxHeight={PREVIEW_HEIGHT - 24}
            />
          )}
        </div>
      </button>

      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] text-[var(--calqo-text-3)]">{index + 1}</span>
        {renaming ? (
          <input
            autoFocus
            defaultValue={artboard.name}
            className="min-w-0 flex-1 rounded-[6px] border border-[var(--calqo-accent)] bg-[var(--calqo-glass)] px-1.5 py-0.5 text-[12px] text-[var(--calqo-text)] outline-none"
            onBlur={(event) => {
              renameArtboard(project.id, artboard.id, event.target.value);
              onEndRename();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') onEndRename();
            }}
          />
        ) : (
          <button
            type="button"
            className={cn(
              'min-w-0 flex-1 truncate text-left text-[12px]',
              active
                ? 'font-semibold text-[var(--calqo-accent)]'
                : 'text-[var(--calqo-text-2)]',
            )}
            onClick={onSelect}
            onDoubleClick={onStartRename}
          >
            {artboard.name}
          </button>
        )}
        <span className="mono shrink-0 text-[9.5px] text-[var(--calqo-text-3)]">
          {artboard.width}x{artboard.height}
        </span>
      </div>
    </div>
  );
}

function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-[var(--calqo-radius-md)] border border-dashed border-[var(--calqo-divider)] text-[var(--calqo-text-3)] transition-colors hover:border-[var(--calqo-accent)] hover:text-[var(--calqo-accent)]"
      style={{ height: PREVIEW_HEIGHT }}
    >
      <Plus size={20} />
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  );
}

/** Right-click menu for an overview tile: rename, change format (preset
 * submenu), duplicate, delete. Anchored at container-relative pixels. */
function ArtboardContextMenu({
  project,
  artboardId,
  x,
  y,
  canDelete,
  onRename,
  onClose,
}: {
  project: CalqoProject;
  artboardId: string;
  x: number;
  y: number;
  canDelete: boolean;
  onRename: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('editor');
  const menuRef = useRef<HTMLDivElement>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });
  const [flipSub, setFlipSub] = useState(false);
  const artboard = project.artboards.find((ab) => ab.id === artboardId);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  // Clamp into the scroll container once mounted — parentElement is only known
  // after the first render, so measure the real menu/container here.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const container = menu?.parentElement;
    if (!menu || !container) return;
    const left = Math.max(8, Math.min(x, container.clientWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(y, container.clientHeight - menu.offsetHeight - 8));
    setPos({ left, top });
    // Flip the format submenu leftward when there isn't room on the right.
    setFlipSub(left + menu.offsetWidth + 208 > container.clientWidth);
  }, [x, y]);

  if (!artboard) return null;

  const itemClass =
    'flex w-full items-center justify-between gap-3 rounded-[var(--calqo-radius-xs)] px-2 py-1.5 text-left text-[12.5px] text-[var(--calqo-text)] transition-colors hover:bg-[var(--calqo-hover)]';

  return (
    <div
      ref={menuRef}
      role="menu"
      className="glass glass-strong absolute z-50 flex w-48 flex-col gap-0.5 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
      style={{ left: pos.left, top: pos.top }}
    >
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        {t('overview.rename')}
      </button>

      <div className="relative">
        <button
          type="button"
          role="menuitem"
          aria-expanded={formatOpen}
          className={itemClass}
          onClick={() => setFormatOpen((open) => !open)}
        >
          <span>{t('overview.changeFormat')}</span>
          <span className="text-[var(--calqo-text-3)]">›</span>
        </button>
        {formatOpen && (
          <div
            className={cn(
              'glass glass-strong absolute top-0 flex w-52 flex-col gap-0.5 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.28)]',
              flipSub ? 'right-full mr-1' : 'left-full ml-1',
            )}
          >
            {ARTBOARD_PRESET_LIST.map((preset) => {
              const current =
                preset.width === artboard.width && preset.height === artboard.height;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="menuitem"
                  disabled={current}
                  className="flex w-full items-center justify-between gap-2 rounded-[var(--calqo-radius-xs)] px-2 py-1.5 text-left text-[12px] transition-colors enabled:hover:bg-[var(--calqo-hover)] disabled:opacity-40"
                  onClick={() => {
                    resizeArtboard(project.id, artboardId, preset.id as ArtboardPresetId);
                    onClose();
                  }}
                >
                  <span className="truncate text-[var(--calqo-text)]">{preset.name}</span>
                  <span className="mono shrink-0 text-[9.5px] text-[var(--calqo-text-3)]">
                    {preset.width}x{preset.height}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span className="my-1 block h-px w-full bg-[var(--calqo-divider)]" />

      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          duplicateArtboard(project.id, artboardId);
          onClose();
        }}
      >
        {t('artboards.duplicateSameSize')}
      </button>
      {canDelete && (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-3 rounded-[var(--calqo-radius-xs)] px-2 py-1.5 text-left text-[12.5px] text-[#E5484D] transition-colors hover:bg-[var(--calqo-hover)]"
          onClick={() => {
            deleteArtboard(project.id, artboardId);
            onClose();
          }}
        >
          {t('artboards.delete')}
        </button>
      )}
    </div>
  );
}
