import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addArtboard,
  copySelectedLayers,
  createShapeLayer,
  deleteArtboard,
  duplicateArtboard,
  groupSelectedLayers,
  pasteLayers,
  reorderTopLevelLayer,
  shiftSelectionZOrder,
  ungroupLayer,
} from '@/editor/commands/projectCommands';
import { isGroupLayer } from '@/editor/utils/layers';
import { createDefaultProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';

function seedProject(populate?: (project: ReturnType<typeof createDefaultProject>) => void) {
  const project = createDefaultProject();
  populate?.(project);
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  return project;
}

function liveArtboard(projectId: string) {
  return projectStore.getState().projects[projectId].artboards;
}

describe('phase C — layers, artboards, copy/paste', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
  });

  it('reorders top-level layers', () => {
    const a = createShapeLayer('rect', 0, 0, 10, 10);
    const b = createShapeLayer('rect', 0, 0, 10, 10);
    const c = createShapeLayer('rect', 0, 0, 10, 10);
    const project = seedProject((p) => p.artboards[0].layers.push(a, b, c));

    reorderTopLevelLayer(project.id, 0, 2);

    const order = liveArtboard(project.id)[0].layers.map((l) => l.id);
    expect(order).toEqual([b.id, c.id, a.id]);
  });

  it('shifts selection to front in z-order', () => {
    const a = createShapeLayer('rect', 0, 0, 10, 10);
    const b = createShapeLayer('rect', 0, 0, 10, 10);
    const c = createShapeLayer('rect', 0, 0, 10, 10);
    const project = seedProject((p) => p.artboards[0].layers.push(a, b, c));
    selectionStore.getState().setSelection([a.id]);

    shiftSelectionZOrder(project.id, 'front');

    const order = liveArtboard(project.id)[0].layers.map((l) => l.id);
    expect(order[order.length - 1]).toBe(a.id);
  });

  it('groups selected layers about their bounding box, then ungroups', () => {
    const a = createShapeLayer('rect', 100, 100, 50, 50);
    const b = createShapeLayer('rect', 200, 300, 50, 50);
    const project = seedProject((p) => p.artboards[0].layers.push(a, b));
    selectionStore.getState().setSelection([a.id, b.id]);

    groupSelectedLayers(project.id);

    let layers = liveArtboard(project.id)[0].layers;
    expect(layers).toHaveLength(1);
    const group = layers[0];
    if (!isGroupLayer(group)) throw new Error('expected a group');
    expect(group.x).toBe(100);
    expect(group.y).toBe(100);
    expect(group.w).toBe(150); // 250 - 100
    expect(group.h).toBe(250); // 350 - 100
    // children relative to group origin
    const childA = group.children.find((c) => c.id === a.id);
    expect(childA?.x).toBe(0);
    expect(childA?.y).toBe(0);

    ungroupLayer(project.id, group.id);
    layers = liveArtboard(project.id)[0].layers;
    expect(layers).toHaveLength(2);
    const restoredA = layers.find((l) => l.id === a.id);
    expect(restoredA?.x).toBe(100);
    expect(restoredA?.y).toBe(100);
  });

  it('adds and deletes artboards but keeps at least one', () => {
    const project = seedProject();

    addArtboard(project.id, 'story');
    expect(liveArtboard(project.id)).toHaveLength(2);

    const second = liveArtboard(project.id)[1];
    deleteArtboard(project.id, second.id);
    expect(liveArtboard(project.id)).toHaveLength(1);

    // cannot delete the final artboard
    const last = liveArtboard(project.id)[0];
    deleteArtboard(project.id, last.id);
    expect(liveArtboard(project.id)).toHaveLength(1);
  });

  it('duplicates an artboard to a new preset, scaling and centring content', () => {
    const layer = createShapeLayer('rect', 0, 0, 1080, 1080); // fills the square
    const project = seedProject((p) => p.artboards[0].layers.push(layer)); // ig-square

    duplicateArtboard(project.id, project.artboards[0].id, 'story'); // 1080x1920

    const boards = liveArtboard(project.id);
    expect(boards).toHaveLength(2);
    const copy = boards[1];
    expect(copy.width).toBe(1080);
    expect(copy.height).toBe(1920);
    const scaled = copy.layers[0];
    // scale = min(1080/1080, 1920/1080) = 1 → no scale, centred vertically
    expect(scaled.w).toBe(1080);
    expect(scaled.h).toBe(1080);
    expect(scaled.y).toBe((1920 - 1080) / 2);
  });

  it('copies and pastes layers with fresh ids and an offset', () => {
    const layer = createShapeLayer('rect', 100, 100, 50, 50);
    const project = seedProject((p) => p.artboards[0].layers.push(layer));
    selectionStore.getState().setSelection([layer.id]);

    copySelectedLayers(project.id);
    pasteLayers(project.id);

    const layers = liveArtboard(project.id)[0].layers;
    expect(layers).toHaveLength(2);
    const pasted = layers[1];
    expect(pasted.id).not.toBe(layer.id);
    expect(pasted.x).toBe(124);
    expect(pasted.y).toBe(124);
    expect(selectionStore.getState().selectedLayerIds).toEqual([pasted.id]);
  });
});
