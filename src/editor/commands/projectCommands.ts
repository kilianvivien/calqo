import type { Draft } from 'immer';
import { storage } from '@/lib/adapters';
import {
  createArtboard,
  createDefaultProject,
  type CalqoArtboard,
  type CalqoAssetRef,
  type CalqoLayer,
  type CalqoProject,
  type CreateProjectOptions,
  type GlossaryEntry,
  type GroupLayer,
  type LocaleCode,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/schema';
import type { TranslationResult } from '@/editor/ai/AIProvider';
import { detectTextOverflow } from '@/editor/i18n-content/translationPipeline';
import {
  ARTBOARD_PRESETS,
  type ArtboardPresetId,
} from '@/lib/schema/presets';
import { createId } from '@/lib/utils/ids';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import {
  applyLayerPatch,
  boundingBox,
  cloneLayerWithNewIds,
  findLayer,
  findLayerInArtboard,
  isGroupLayer,
  moveInArray,
  removeLayer,
  updateLayer,
  type LayerPatch,
} from '@/editor/utils/layers';

const AUTOSAVE_DELAY = 700;
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

/** Persist a project now, updating its save-state through the lifecycle. */
export async function saveProject(id: string): Promise<void> {
  const timer = pendingSaves.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingSaves.delete(id);
  }
  const project = projectStore.getState().projects[id];
  if (!project) return;

  projectStore.getState().setSaveState(id, 'saving');
  try {
    await storage.saveProject(project);
    projectStore.getState().setSaveState(id, 'saved');
  } catch (err) {
    console.error('[Calqo] save failed', err);
    projectStore.getState().setSaveState(id, 'error');
  }
}

/** Debounced autosave; coalesces rapid edits into one write. */
function scheduleAutosave(id: string): void {
  const existing = pendingSaves.get(id);
  if (existing) clearTimeout(existing);
  pendingSaves.set(
    id,
    setTimeout(() => {
      void saveProject(id);
    }, AUTOSAVE_DELAY),
  );
}

interface EditOptions {
  undoable?: boolean;
}

function activeArtboardId(project: CalqoProject): string | null {
  return selectionStore.getState().activeArtboardId ?? project.artboards[0]?.id ?? null;
}

function getArtboard(
  project: CalqoProject | Draft<CalqoProject>,
  artboardId: string,
): CalqoArtboard | Draft<CalqoArtboard> | undefined {
  return project.artboards.find((artboard) => artboard.id === artboardId);
}

function snapshotForHistory(id: string): void {
  const project = projectStore.getState().projects[id];
  if (project) historyStore.getState().push(id, project);
}

function replaceFromHistory(project: CalqoProject): void {
  projectStore.getState().replaceProject(project, 'unsaved');
  scheduleAutosave(project.id);
  const selected = selectionStore.getState().selectedLayerIds;
  const artboard = project.artboards.find(
    (candidate) => candidate.id === selectionStore.getState().activeArtboardId,
  ) ?? project.artboards[0];
  const valid = selected.filter((id) => findLayerInArtboard(artboard, id));
  selectionStore.getState().setSelection(valid);
}

/** The single mutation entry point: apply an immer change, then autosave. */
export function editProject(
  id: string,
  recipe: (draft: Draft<CalqoProject>) => void,
  options: EditOptions = {},
): void {
  if (options.undoable) snapshotForHistory(id);
  projectStore.getState().patchProject(id, recipe);
  scheduleAutosave(id);
}

export function undoProject(id: string): void {
  const current = projectStore.getState().projects[id];
  if (!current) return;
  const previous = historyStore.getState().undo(id, current);
  if (previous) replaceFromHistory(previous);
}

export function redoProject(id: string): void {
  const current = projectStore.getState().projects[id];
  if (!current) return;
  const next = historyStore.getState().redo(id, current);
  if (next) replaceFromHistory(next);
}

export function canUndoProject(id: string | null): boolean {
  if (!id) return false;
  return (historyStore.getState().histories[id]?.past.length ?? 0) > 0;
}

export function canRedoProject(id: string | null): boolean {
  if (!id) return false;
  return (historyStore.getState().histories[id]?.future.length ?? 0) > 0;
}

/** Create a fresh project, persist it, and open it in a new active tab. */
export async function createProject(
  options?: CreateProjectOptions,
): Promise<string> {
  const project = createDefaultProject(options);
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  selectionStore.getState().setActiveArtboard(project.artboards[0]?.id ?? null);
  selectionStore.getState().clearSelection();
  await saveProject(project.id);
  return project.id;
}

/** Adopt an externally produced document (import / AI) into the workspace. */
export async function adoptProject(project: CalqoProject): Promise<string> {
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  selectionStore.getState().setActiveArtboard(project.artboards[0]?.id ?? null);
  selectionStore.getState().clearSelection();
  await saveProject(project.id);
  return project.id;
}

export function renameProject(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  editProject(id, (draft) => {
    draft.name = trimmed;
  });
}

/** Deep-copy a project under a new id and open it. Assets are shared by id for
 * now (no images until Phase B); asset duplication lands with the image layer. */
export async function duplicateProject(id: string): Promise<string | null> {
  const source = projectStore.getState().projects[id];
  if (!source) return null;
  const now = new Date().toISOString();
  const copy: CalqoProject = {
    ...structuredClone(source),
    id: createId('proj'),
    name: `${source.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
  projectStore.getState().upsertProject(copy);
  workspaceStore.getState().openTab(copy.id, true);
  selectionStore.getState().setActiveArtboard(copy.artboards[0]?.id ?? null);
  selectionStore.getState().clearSelection();
  await saveProject(copy.id);
  return copy.id;
}

/** Load a saved project into the workspace (or just focus it if already open). */
export async function openProject(id: string): Promise<void> {
  const inMemory = projectStore.getState().projects[id];
  if (inMemory) {
    workspaceStore.getState().openTab(id, true);
    selectionStore
      .getState()
      .setActiveArtboard(inMemory.artboards[0]?.id ?? null);
    return;
  }
  const project = await storage.getProject(id);
  if (!project) return;
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(id, true);
  selectionStore.getState().setActiveArtboard(project.artboards[0]?.id ?? null);
  selectionStore.getState().clearSelection();
}

/** Close a tab, flushing any pending save first so nothing is lost. */
export async function closeProject(id: string): Promise<void> {
  await saveProject(id);
  workspaceStore.getState().closeTab(id);
  projectStore.getState().removeProject(id);
  historyStore.getState().clear(id);
  selectionStore.getState().clearSelection();
}

/** Permanently delete a project from storage and the workspace. */
export async function deleteProject(id: string): Promise<void> {
  await storage.deleteProject(id);
  workspaceStore.getState().closeTab(id);
  projectStore.getState().removeProject(id);
  historyStore.getState().clear(id);
  selectionStore.getState().clearSelection();
}

/** Flush all pending autosaves immediately (e.g. on page unload). */
export async function flushPendingSaves(): Promise<void> {
  await Promise.all([...pendingSaves.keys()].map((id) => saveProject(id)));
}

/** On startup, reopen the tabs that were open last session by loading their
 * documents from storage; silently drop any that no longer exist. */
export async function hydrateWorkspace(): Promise<void> {
  const { openTabIds, activeProjectId } = workspaceStore.getState();
  if (openTabIds.length === 0) return;

  const loaded: string[] = [];
  for (const id of openTabIds) {
    try {
      const project = await storage.getProject(id);
      if (project) {
        projectStore.getState().upsertProject(project);
        loaded.push(id);
      }
    } catch (err) {
      console.error(`[Calqo] failed to load project ${id}`, err);
    }
  }

  const nextActive =
    activeProjectId && loaded.includes(activeProjectId)
      ? activeProjectId
      : (loaded[0] ?? null);
  workspaceStore.getState().hydrate({
    openTabIds: loaded,
    activeProjectId: nextActive,
  });
  const active = nextActive ? projectStore.getState().projects[nextActive] : null;
  selectionStore.getState().setActiveArtboard(active?.artboards[0]?.id ?? null);
  selectionStore.getState().clearSelection();
}

function baseLayer(name: string, x: number, y: number, w: number, h: number) {
  return {
    id: createId('layer'),
    name,
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
}

export function createTextLayer(
  project: CalqoProject,
  x: number,
  y: number,
): CalqoLayer {
  return {
    ...baseLayer('Text', x, y, 360, 96),
    type: 'text',
    text: { [project.activeContentLocale]: 'Double-click to edit' },
    style: {
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 700,
      color: '#111827',
      align: 'left',
      lineHeight: 1.1,
      letterSpacing: 0,
    },
  };
}

export interface ShapeStyleDefaults {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  brushSize?: number;
}

export type PolygonPreset = 'triangle' | 'diamond' | 'badge' | 'star';

/** Strokes whose width should default to a thicker, line-like weight. */
const LINE_LIKE = new Set<ShapeLayer['shape']>(['line', 'arrow', 'freehand']);

function shapeName(shape: ShapeLayer['shape']): string {
  if (shape === 'line') return 'Line';
  if (shape === 'arrow') return 'Arrow';
  if (shape === 'freehand') return 'Drawing';
  if (shape === 'ellipse') return 'Ellipse';
  return 'Rectangle';
}

export function createShapeLayer(
  shape: ShapeLayer['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
  defaults?: ShapeStyleDefaults,
): CalqoLayer {
  const fill = defaults?.fill ?? '#FFFFFF';
  const strokeColor = defaults?.stroke ?? '#007AFF';
  const baseWidth = defaults?.strokeWidth ?? 2;
  const strokeWidth = LINE_LIKE.has(shape) ? Math.max(baseWidth, 4) : baseWidth;
  const layer: ShapeLayer = {
    ...baseLayer(shapeName(shape), x, y, w, h),
    type: 'shape',
    shape,
    fill: { type: 'solid', color: LINE_LIKE.has(shape) ? 'transparent' : fill },
    stroke: {
      color: strokeColor,
      width: strokeWidth,
      ...(defaults?.strokeStyle && defaults.strokeStyle !== 'solid'
        ? { style: defaults.strokeStyle }
        : {}),
    },
    cornerRadius: shape === 'rect' ? 18 : undefined,
  };
  if (shape === 'line' || shape === 'arrow') {
    layer.h = Math.max(1, h);
    layer.points = [0, 0, Math.max(1, w), Math.max(1, h)];
  }
  if (shape === 'arrow') {
    layer.arrow = { start: false, end: true, pointerLength: 16, pointerWidth: 16 };
  }
  return layer;
}

/** Build an arrow layer between two artboard points (drag interaction). */
export function createArrowLayer(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  defaults?: ShapeStyleDefaults,
): CalqoLayer {
  const layer = createShapeLayer('arrow', x1, y1, Math.max(1, Math.abs(x2 - x1)), Math.max(1, Math.abs(y2 - y1)), defaults);
  if (layer.type === 'shape') {
    layer.points = [0, 0, x2 - x1, y2 - y1];
  }
  return layer;
}

/** Build a freehand stroke from a flat list of absolute artboard points,
 * normalised to a layer box (brush / hand-drawing tool). */
export function createFreehandLayer(
  absolutePoints: number[],
  defaults?: ShapeStyleDefaults,
): CalqoLayer | null {
  if (absolutePoints.length < 4) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < absolutePoints.length; i += 2) {
    minX = Math.min(minX, absolutePoints[i]);
    maxX = Math.max(maxX, absolutePoints[i]);
    minY = Math.min(minY, absolutePoints[i + 1]);
    maxY = Math.max(maxY, absolutePoints[i + 1]);
  }
  const relative = absolutePoints.map((value, i) => (i % 2 === 0 ? value - minX : value - minY));
  const layer = createShapeLayer('freehand', minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), defaults);
  if (layer.type === 'shape') {
    layer.points = relative;
    layer.tension = 0.4;
    layer.fill = { type: 'solid', color: 'transparent' };
    layer.stroke = {
      color: defaults?.stroke ?? '#111827',
      width: defaults?.brushSize ?? 6,
      cap: 'round',
    };
  }
  return layer;
}

/** Build a closed custom polygon from absolute artboard points (pen tool). */
export function createCustomPolygonLayer(
  absolutePoints: number[],
  defaults?: ShapeStyleDefaults,
): CalqoLayer | null {
  if (absolutePoints.length < 6) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < absolutePoints.length; i += 2) {
    minX = Math.min(minX, absolutePoints[i]);
    maxX = Math.max(maxX, absolutePoints[i]);
    minY = Math.min(minY, absolutePoints[i + 1]);
    maxY = Math.max(maxY, absolutePoints[i + 1]);
  }
  const relative = absolutePoints.map((value, i) => (i % 2 === 0 ? value - minX : value - minY));
  const layer = createShapeLayer('polygon', minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), defaults);
  if (layer.type === 'shape') {
    layer.name = 'Polygon';
    layer.points = relative;
  }
  return layer;
}

export function polygonPoints(preset: PolygonPreset, w: number, h: number): number[] {
  if (preset === 'triangle') return [w / 2, 0, w, h, 0, h];
  if (preset === 'diamond') return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
  if (preset === 'badge') {
    const cutX = w * 0.18;
    return [
      cutX, 0,
      w - cutX, 0,
      w, h / 2,
      w - cutX, h,
      cutX, h,
      0, h / 2,
    ];
  }
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2;
  const inner = outer * 0.46;
  return Array.from({ length: 10 }).flatMap((_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

function polygonName(preset: PolygonPreset): string {
  if (preset === 'badge') return 'Badge';
  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

export function createPolygonShapeLayer(
  preset: PolygonPreset,
  x: number,
  y: number,
  w: number,
  h: number,
  defaults?: ShapeStyleDefaults,
): CalqoLayer {
  const layer = createShapeLayer('polygon', x, y, w, h, defaults);
  if (layer.type === 'shape') {
    layer.name = polygonName(preset);
    layer.points = polygonPoints(preset, w, h);
  }
  return layer;
}

export function createAssetLayer(
  asset: CalqoAssetRef,
  x: number,
  y: number,
): CalqoLayer {
  const w = asset.width ?? 360;
  const h = asset.height ?? 240;
  if (asset.kind === 'svg') {
    return {
      ...baseLayer(asset.name, x, y, w, h),
      type: 'svg',
      assetId: asset.id,
    };
  }
  return {
    ...baseLayer(asset.name, x, y, w, h),
    type: 'image',
    assetId: asset.id,
    fit: 'cover',
  };
}

export function addImportedAssetLayer(
  projectId: string,
  asset: CalqoAssetRef,
  x: number,
  y: number,
): void {
  const layer = createAssetLayer(asset, x, y);
  editProject(
    projectId,
    (draft) => {
      if (!draft.assets.some((existing) => existing.id === asset.id)) {
        draft.assets.push(asset);
      }
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      artboard?.layers.push(layer);
    },
    { undoable: true },
  );
  selectionStore.getState().selectOne(layer.id);
}

export function replaceLayerAsset(
  projectId: string,
  layerId: string,
  asset: CalqoAssetRef,
): void {
  editProject(
    projectId,
    (draft) => {
      if (!draft.assets.some((existing) => existing.id === asset.id)) {
        draft.assets.push(asset);
      }
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      if (!artboard) return;
      updateLayer(artboard.layers as CalqoLayer[], layerId, (layer) => {
        if (layer.type === 'image' && asset.kind === 'raster') {
          layer.assetId = asset.id;
          layer.w = asset.width ?? layer.w;
          layer.h = asset.height ?? layer.h;
        }
        if (layer.type === 'svg' && asset.kind === 'svg') {
          layer.assetId = asset.id;
        }
      });
    },
    { undoable: true },
  );
}

export function addLayerToActiveArtboard(projectId: string, layer: CalqoLayer): void {
  editProject(
    projectId,
    (draft) => {
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      artboard?.layers.push(layer);
    },
    { undoable: true },
  );
  selectionStore.getState().selectOne(layer.id);
}

export function updateLayerInActiveArtboard(
  projectId: string,
  layerId: string,
  patch: LayerPatch,
  options: EditOptions = { undoable: true },
): void {
  editProject(
    projectId,
    (draft) => {
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      if (!artboard) return;
      updateLayer(artboard.layers as CalqoLayer[], layerId, (layer) => {
        applyLayerPatch(layer, patch);
      });
    },
    options,
  );
}

export function renameLayer(
  projectId: string,
  layerId: string,
  name: string,
): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  updateLayerInActiveArtboard(projectId, layerId, { name: trimmed });
}

export function deleteSelectedLayers(projectId: string): void {
  const ids = selectionStore.getState().selectedLayerIds;
  if (ids.length === 0) return;
  editProject(
    projectId,
    (draft) => {
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      if (!artboard) return;
      ids.forEach((id) => removeLayer(artboard.layers as CalqoLayer[], id));
    },
    { undoable: true },
  );
  selectionStore.getState().clearSelection();
}

export function duplicateSelectedLayers(projectId: string): void {
  const ids = selectionStore.getState().selectedLayerIds;
  if (ids.length === 0) return;
  const project = projectStore.getState().projects[projectId];
  const artboardId = project ? activeArtboardId(project) : null;
  const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
  if (!artboard) return;
  const copies = ids
    .map((id) => findLayer(artboard.layers, id))
    .filter((layer): layer is CalqoLayer => Boolean(layer))
    .map((layer) => {
      const copy = cloneLayerWithNewIds(layer);
      copy.name = `${layer.name} copy`;
      copy.x = layer.x + 24;
      copy.y = layer.y + 24;
      return copy;
    });
  if (copies.length === 0) return;
  editProject(
    projectId,
    (draft) => {
      const target = getArtboard(draft, artboard.id);
      target?.layers.push(...copies);
    },
    { undoable: true },
  );
  selectionStore.getState().setSelection(copies.map((copy) => copy.id));
}

/** Duplicate a single layer by id (per-row action in the layers panel). */
export function duplicateLayerById(projectId: string, layerId: string): void {
  const project = projectStore.getState().projects[projectId];
  const artboardId = project ? activeArtboardId(project) : null;
  const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
  if (!artboard) return;
  const source = findLayer(artboard.layers, layerId);
  if (!source) return;
  const copy = cloneLayerWithNewIds(source);
  copy.name = `${source.name} copy`;
  copy.x = source.x + 24;
  copy.y = source.y + 24;
  editProject(
    projectId,
    (draft) => {
      const target = getArtboard(draft, artboard.id);
      target?.layers.push(copy);
    },
    { undoable: true },
  );
  selectionStore.getState().selectOne(copy.id);
}

// --- Layer ordering -------------------------------------------------------

/** Reorder a top-level layer within the active artboard (layers-panel drag). */
export function reorderTopLevelLayer(
  projectId: string,
  fromIndex: number,
  toIndex: number,
): void {
  editProject(
    projectId,
    (draft) => {
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      if (!artboard) return;
      artboard.layers = moveInArray(
        artboard.layers as CalqoLayer[],
        fromIndex,
        toIndex,
      );
    },
    { undoable: true },
  );
}

type ZOrder = 'forward' | 'backward' | 'front' | 'back';

/** Shift the selected top-level layers in the z-order ([ ] and Cmd+[ ] keys). */
export function shiftSelectionZOrder(projectId: string, order: ZOrder): void {
  const ids = selectionStore.getState().selectedLayerIds;
  if (ids.length === 0) return;
  editProject(
    projectId,
    (draft) => {
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      if (!artboard) return;
      const layers = artboard.layers as CalqoLayer[];
      // Recompute against live positions each step so multi-select moves stay
      // consistent as the array shifts under us.
      const move = (id: string, target: number) => {
        const from = artboard.layers.findIndex((layer) => layer.id === id);
        if (from < 0) return;
        const clamped = Math.min(Math.max(target, 0), artboard.layers.length - 1);
        artboard.layers = moveInArray(artboard.layers as CalqoLayer[], from, clamped);
      };
      const ordered = ids
        .map((id) => ({ id, index: layers.findIndex((layer) => layer.id === id) }))
        .filter((entry) => entry.index >= 0)
        .sort((a, b) => a.index - b.index);
      if (ordered.length === 0) return;
      if (order === 'back') {
        ordered.forEach((entry, i) => move(entry.id, i));
      } else if (order === 'front') {
        [...ordered].reverse().forEach((entry, i) => move(entry.id, layers.length - 1 - i));
      } else if (order === 'backward') {
        ordered.forEach((entry) => {
          const from = artboard.layers.findIndex((layer) => layer.id === entry.id);
          move(entry.id, from - 1);
        });
      } else {
        [...ordered].reverse().forEach((entry) => {
          const from = artboard.layers.findIndex((layer) => layer.id === entry.id);
          move(entry.id, from + 1);
        });
      }
    },
    { undoable: true },
  );
}

// --- Grouping -------------------------------------------------------------

/** Group the selected top-level layers into a new group at their bounding box.
 * Child coordinates are rewritten relative to the group origin. */
export function groupSelectedLayers(projectId: string): void {
  const ids = selectionStore.getState().selectedLayerIds;
  if (ids.length < 2) return;
  const project = projectStore.getState().projects[projectId];
  const artboardId = project ? activeArtboardId(project) : null;
  const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
  if (!artboard) return;
  // Only group layers that are direct children of the artboard, in z-order.
  const ordered = artboard.layers.filter((layer) => ids.includes(layer.id));
  if (ordered.length < 2) return;
  const box = boundingBox(ordered);
  const groupId = createId('layer');
  editProject(
    projectId,
    (draft) => {
      const target = getArtboard(draft, artboard.id);
      if (!target) return;
      const layers = target.layers as CalqoLayer[];
      const topIndex = Math.max(
        ...ordered.map((layer) => layers.findIndex((candidate) => candidate.id === layer.id)),
      );
      const children = ordered.map((layer) => {
        const removed = removeLayer(layers, layer.id);
        if (removed) {
          removed.x -= box.x;
          removed.y -= box.y;
        }
        return removed;
      }).filter((layer): layer is CalqoLayer => Boolean(layer));
      const group: GroupLayer = {
        id: groupId,
        name: 'Group',
        type: 'group',
        x: box.x,
        y: box.y,
        w: Math.max(1, box.w),
        h: Math.max(1, box.h),
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        expanded: true,
        children,
      };
      const insertAt = Math.min(topIndex - children.length + 1, layers.length);
      layers.splice(Math.max(0, insertAt), 0, group);
    },
    { undoable: true },
  );
  selectionStore.getState().selectOne(groupId);
}

/** Dissolve a group, lifting its children back into the parent at their
 * absolute positions. */
export function ungroupLayer(projectId: string, groupId: string): void {
  const project = projectStore.getState().projects[projectId];
  const artboardId = project ? activeArtboardId(project) : null;
  const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
  if (!artboard) return;
  const group = findLayer(artboard.layers, groupId);
  if (!group || !isGroupLayer(group)) return;
  const childIds: string[] = [];
  editProject(
    projectId,
    (draft) => {
      const target = getArtboard(draft, artboard.id);
      if (!target) return;
      const layers = target.layers as CalqoLayer[];
      const index = layers.findIndex((layer) => layer.id === groupId);
      if (index < 0) return;
      const live = layers[index];
      if (!isGroupLayer(live)) return;
      const children = live.children.map((child) => {
        child.x += live.x;
        child.y += live.y;
        childIds.push(child.id);
        return child;
      });
      layers.splice(index, 1, ...children);
    },
    { undoable: true },
  );
  selectionStore.getState().setSelection(childIds);
}

/** Ungroup the selection if it is exactly one group (keyboard shortcut). */
export function ungroupSelected(projectId: string): void {
  const ids = selectionStore.getState().selectedLayerIds;
  if (ids.length !== 1) return;
  const project = projectStore.getState().projects[projectId];
  const artboardId = project ? activeArtboardId(project) : null;
  const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
  const layer = artboard ? findLayer(artboard.layers, ids[0]) : null;
  if (layer && isGroupLayer(layer)) ungroupLayer(projectId, layer.id);
}

/** Select every top-level layer in the active artboard (Cmd/Ctrl+A). */
export function selectAllLayers(projectId: string): void {
  const project = projectStore.getState().projects[projectId];
  const artboardId = project ? activeArtboardId(project) : null;
  const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
  if (!artboard) return;
  selectionStore.getState().setSelection(artboard.layers.map((layer) => layer.id));
}

/** Persist a group's expand/collapse state (panel-only, not history-worthy). */
export function setGroupExpanded(
  projectId: string,
  groupId: string,
  expanded: boolean,
): void {
  editProject(projectId, (draft) => {
    draft.artboards.forEach((artboard) => {
      updateLayer(artboard.layers as CalqoLayer[], groupId, (layer) => {
        if (isGroupLayer(layer)) layer.expanded = expanded;
      });
    });
  });
}

// --- Copy / paste ---------------------------------------------------------

/** In-memory layer clipboard, shared across tabs within the session. */
let layerClipboard: CalqoLayer[] = [];

export function copySelectedLayers(projectId: string): void {
  const ids = selectionStore.getState().selectedLayerIds;
  const project = projectStore.getState().projects[projectId];
  const artboardId = project ? activeArtboardId(project) : null;
  const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
  if (!artboard) return;
  const copied = ids
    .map((id) => findLayer(artboard.layers, id))
    .filter((layer): layer is CalqoLayer => Boolean(layer))
    .map((layer) => structuredClone(layer));
  if (copied.length > 0) layerClipboard = copied;
}

export function hasClipboardLayers(): boolean {
  return layerClipboard.length > 0;
}

/** Paste the clipboard into the active artboard with a small offset; new ids
 * are minted so pasted layers are independent of their source. */
export function pasteLayers(projectId: string): void {
  if (layerClipboard.length === 0) return;
  const pasted = layerClipboard.map((layer) => {
    const copy = cloneLayerWithNewIds(layer);
    copy.x += 24;
    copy.y += 24;
    return copy;
  });
  editProject(
    projectId,
    (draft) => {
      const artboardId = activeArtboardId(draft as CalqoProject);
      if (!artboardId) return;
      const artboard = getArtboard(draft, artboardId);
      artboard?.layers.push(...pasted);
    },
    { undoable: true },
  );
  selectionStore.getState().setSelection(pasted.map((layer) => layer.id));
}

// --- Artboards ------------------------------------------------------------

/** Switch the editor to a different artboard and clear the layer selection. */
export function setActiveArtboard(artboardId: string): void {
  selectionStore.getState().setActiveArtboard(artboardId);
  selectionStore.getState().clearSelection();
}

export function addArtboard(
  projectId: string,
  preset: ArtboardPresetId = 'ig-square',
): void {
  const artboard = createArtboard(preset);
  editProject(
    projectId,
    (draft) => {
      draft.artboards.push(artboard);
    },
    { undoable: true },
  );
  setActiveArtboard(artboard.id);
}

export function renameArtboard(
  projectId: string,
  artboardId: string,
  name: string,
): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  editProject(
    projectId,
    (draft) => {
      const target = draft.artboards.find((candidate) => candidate.id === artboardId);
      if (target) target.name = trimmed;
    },
    { undoable: true },
  );
}

export function deleteArtboard(projectId: string, artboardId: string): void {
  const project = projectStore.getState().projects[projectId];
  if (!project || project.artboards.length <= 1) return; // keep at least one
  const remaining = project.artboards.filter((ab) => ab.id !== artboardId);
  editProject(
    projectId,
    (draft) => {
      draft.artboards = draft.artboards.filter((ab) => ab.id !== artboardId);
    },
    { undoable: true },
  );
  if (selectionStore.getState().activeArtboardId === artboardId) {
    setActiveArtboard(remaining[0]?.id ?? '');
  }
}

export function reorderArtboard(
  projectId: string,
  fromIndex: number,
  toIndex: number,
): void {
  editProject(
    projectId,
    (draft) => {
      draft.artboards = moveInArray(draft.artboards, fromIndex, toIndex);
    },
    { undoable: true },
  );
}

/** Duplicate an artboard, optionally retargeting it to a different preset size.
 * Layers are scaled to fit the new bounds and recentred (plan §11.3). Layers
 * that still fall outside the new artboard are flagged with a fit warning. */
export function duplicateArtboard(
  projectId: string,
  artboardId: string,
  targetPreset?: ArtboardPresetId,
): void {
  const project = projectStore.getState().projects[projectId];
  const source = project?.artboards.find((ab) => ab.id === artboardId);
  if (!source) return;
  const preset = targetPreset ? ARTBOARD_PRESETS[targetPreset] : null;
  const newWidth = preset?.width ?? source.width;
  const newHeight = preset?.height ?? source.height;

  const copy = structuredClone(source) as CalqoArtboard;
  copy.id = createId('ab');
  copy.name = preset ? `${source.name} → ${preset.name}` : `${source.name} copy`;
  copy.preset = preset ? preset.id : source.preset;
  copy.width = newWidth;
  copy.height = newHeight;

  if (preset && (newWidth !== source.width || newHeight !== source.height)) {
    const scale = Math.min(newWidth / source.width, newHeight / source.height);
    const offsetX = (newWidth - source.width * scale) / 2;
    const offsetY = (newHeight - source.height * scale) / 2;
    copy.layers = copy.layers.map((layer) => {
      const scaled = scaleLayerAroundOrigin(layer, scale);
      scaled.x += offsetX;
      scaled.y += offsetY;
      return scaled;
    });
  }

  editProject(
    projectId,
    (draft) => {
      const index = draft.artboards.findIndex((ab) => ab.id === artboardId);
      draft.artboards.splice(index + 1, 0, copy);
    },
    { undoable: true },
  );
  setActiveArtboard(copy.id);
}

/** Scale a layer (and group children) about the artboard origin by a factor. */
function scaleLayerAroundOrigin(layer: CalqoLayer, scale: number): CalqoLayer {
  const next = structuredClone(layer);
  const apply = (target: CalqoLayer) => {
    target.x *= scale;
    target.y *= scale;
    target.w = Math.max(1, target.w * scale);
    target.h = Math.max(1, target.h * scale);
    if (target.type === 'text') {
      target.style.fontSize = Math.max(1, target.style.fontSize * scale);
    }
    if (target.type === 'shape' && target.points) {
      target.points = target.points.map((value) => value * scale);
    }
    if (isGroupLayer(target)) target.children.forEach(apply);
  };
  apply(next);
  return next;
}

// --- Content locales & translation ---------------------------------------

/** Walk every text layer in the project (recursing into groups). */
function forEachTextLayer(
  project: CalqoProject | Draft<CalqoProject>,
  fn: (layer: TextLayer) => void,
): void {
  const visit = (layers: CalqoLayer[]) => {
    for (const layer of layers) {
      if (layer.type === 'text') fn(layer as TextLayer);
      else if (isGroupLayer(layer)) visit(layer.children);
    }
  };
  project.artboards.forEach((artboard) => visit(artboard.layers as CalqoLayer[]));
}

/** Switch the active content locale (drives canvas + inspector rendering). Not
 * undoable — it's a view setting, like changing the active artboard. */
export function setActiveContentLocale(
  projectId: string,
  locale: LocaleCode,
): void {
  editProject(projectId, (draft) => {
    if (draft.contentLocales.includes(locale)) {
      draft.activeContentLocale = locale;
    }
  });
}

/** Add a content locale, optionally seeding every text layer from a source
 * locale, then switch to it (plan §13.1). */
export function addContentLocale(
  projectId: string,
  locale: LocaleCode,
  options: { copyFrom?: LocaleCode } = {},
): void {
  editProject(
    projectId,
    (draft) => {
      if (!draft.contentLocales.includes(locale)) {
        draft.contentLocales.push(locale);
      }
      if (options.copyFrom) {
        const source = options.copyFrom;
        forEachTextLayer(draft, (layer) => {
          if (layer.text[source] !== undefined && layer.text[locale] === undefined) {
            layer.text[locale] = layer.text[source];
          }
        });
      }
      draft.activeContentLocale = locale;
    },
    { undoable: true },
  );
}

/** Remove a content locale and its per-layer text. Keeps at least one locale
 * and reassigns the active locale if needed. */
export function removeContentLocale(
  projectId: string,
  locale: LocaleCode,
): void {
  const project = projectStore.getState().projects[projectId];
  if (!project || project.contentLocales.length <= 1) return;
  editProject(
    projectId,
    (draft) => {
      draft.contentLocales = draft.contentLocales.filter((l) => l !== locale);
      forEachTextLayer(draft, (layer) => {
        delete layer.text[locale];
      });
      if (draft.activeContentLocale === locale) {
        draft.activeContentLocale = draft.contentLocales[0];
      }
    },
    { undoable: true },
  );
}

/** Set a single text layer's value for a specific locale (plan §13.1). */
export function updateTextForLocale(
  projectId: string,
  layerId: string,
  locale: LocaleCode,
  value: string,
): void {
  editProject(
    projectId,
    (draft) => {
      draft.artboards.forEach((artboard) => {
        updateLayer(artboard.layers as CalqoLayer[], layerId, (layer) => {
          if (layer.type === 'text') layer.text[locale] = value;
        });
      });
    },
    { undoable: true },
  );
}

/** Replace the project glossary (translation dialog edits it inline). */
export function updateGlossary(
  projectId: string,
  glossary: GlossaryEntry[],
): void {
  editProject(projectId, (draft) => {
    draft.glossary = glossary;
  });
}

/** Apply a reconciled translation result: write each item into its layer's
 * target-locale text, register the locale, and refresh overflow flags
 * (plan §13.4, §13.6). */
export function applyTranslationResult(
  projectId: string,
  result: TranslationResult,
): void {
  if (result.items.length === 0) return;
  editProject(
    projectId,
    (draft) => {
      if (!draft.contentLocales.includes(result.targetLocale)) {
        draft.contentLocales.push(result.targetLocale);
      }
      for (const item of result.items) {
        const artboard = draft.artboards.find((ab) => ab.id === item.artboardId);
        if (!artboard) continue;
        updateLayer(artboard.layers as CalqoLayer[], item.layerId, (layer) => {
          if (layer.type !== 'text') return;
          layer.text[result.targetLocale] = item.translatedText;
          const overflow = detectTextOverflow(layer as TextLayer, result.targetLocale);
          if (overflow) layer.overflow = overflow;
          else delete layer.overflow;
        });
      }
    },
    { undoable: true },
  );
}

/** Recompute overflow flags for every text layer at the active locale. */
export function recomputeOverflow(projectId: string): void {
  editProject(projectId, (draft) => {
    const locale = draft.activeContentLocale;
    forEachTextLayer(draft, (layer) => {
      const overflow = detectTextOverflow(layer, locale);
      if (overflow) layer.overflow = overflow;
      else delete layer.overflow;
    });
  });
}

/** Layers that fall outside their artboard bounds — surfaced as fit warnings
 * (plan §11.4). Checks top-level layers only. */
export function artboardOverflowLayerIds(artboard: CalqoArtboard): string[] {
  return artboard.layers
    .filter(
      (layer) =>
        layer.x < -0.5 ||
        layer.y < -0.5 ||
        layer.x + layer.w > artboard.width + 0.5 ||
        layer.y + layer.h > artboard.height + 0.5,
    )
    .map((layer) => layer.id);
}
