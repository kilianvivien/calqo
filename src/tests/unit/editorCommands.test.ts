import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addLayerToActiveArtboard,
  createShapeLayer,
  redoProject,
  undoProject,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { createDefaultProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';

describe('editor commands', () => {
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

  it('adds a layer, selects it, and supports undo/redo', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);
    const layer = createShapeLayer('rect', 10, 20, 100, 80);

    addLayerToActiveArtboard(project.id, layer);

    let current = projectStore.getState().projects[project.id];
    expect(current.artboards[0].layers).toHaveLength(1);
    expect(selectionStore.getState().selectedLayerIds).toEqual([layer.id]);

    undoProject(project.id);
    current = projectStore.getState().projects[project.id];
    expect(current.artboards[0].layers).toHaveLength(0);

    redoProject(project.id);
    current = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(current.artboards[0], layer.id)).toBeTruthy();
  });

  it('updates layer geometry through the active artboard', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const layer = createShapeLayer('ellipse', 10, 20, 100, 80);
    project.artboards[0].layers.push(layer);
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);

    updateLayerInActiveArtboard(project.id, layer.id, { x: 44, w: 144 });

    const current = projectStore.getState().projects[project.id];
    const updated = findLayerInArtboard(current.artboards[0], layer.id);
    expect(updated?.x).toBe(44);
    expect(updated?.w).toBe(144);
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
  });
});
