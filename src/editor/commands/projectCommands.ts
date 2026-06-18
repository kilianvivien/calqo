import type { Draft } from 'immer';
import { storage } from '@/lib/adapters';
import {
  createDefaultProject,
  type CalqoArtboard,
  type CalqoAssetRef,
  type CalqoLayer,
  type CalqoProject,
  type CreateProjectOptions,
  type ShapeLayer,
} from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import {
  applyLayerPatch,
  findLayer,
  findLayerInArtboard,
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

export function createShapeLayer(
  shape: ShapeLayer['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
): CalqoLayer {
  const layer: ShapeLayer = {
    ...baseLayer(shape === 'line' ? 'Line' : shape === 'ellipse' ? 'Ellipse' : 'Rectangle', x, y, w, h),
    type: 'shape',
    shape,
    fill: { type: 'solid', color: shape === 'line' ? 'transparent' : '#FFFFFF' },
    stroke: { color: '#007AFF', width: shape === 'line' ? 6 : 2 },
    cornerRadius: shape === 'rect' ? 18 : undefined,
  };
  if (shape === 'line') {
    layer.h = Math.max(1, h);
    layer.points = [0, 0, Math.max(1, w), Math.max(1, h)];
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
    .map((layer) => ({
      ...structuredClone(layer),
      id: createId('layer'),
      name: `${layer.name} copy`,
      x: layer.x + 24,
      y: layer.y + 24,
    }));
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
