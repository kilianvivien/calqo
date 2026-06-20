import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginHistoryCoalescing,
  createShapeLayer,
  createTextLayer,
  endHistoryCoalescing,
  undoProject,
  updateLayerInActiveArtboard,
  updateLayersInActiveArtboard,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { createDefaultProject, type CalqoLayer, type CalqoProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';

/** Build a project with the given layers, commit it to the store (immer freezes
 * it on upsert, so layers must be added before this), and make it active. */
function commitProject(project: CalqoProject, layers: CalqoLayer[]) {
  project.artboards[0].layers.push(...layers);
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
}

describe('phase J — sidebar & inspector usability', () => {
  afterEach(() => {
    endHistoryCoalescing();
    vi.useRealTimers();
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
  });

  it('coalesces a slider drag into a single undo step', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const layer = createShapeLayer('rect', 0, 0, 200, 200);
    commitProject(project, [layer]);

    // Simulate a drag: one begin, many intermediate edits, one end.
    beginHistoryCoalescing();
    for (let value = 1; value <= 30; value++) {
      updateLayerInActiveArtboard(project.id, layer.id, { opacity: value / 100 });
    }
    endHistoryCoalescing();

    // Exactly one snapshot (the pre-drag state) was pushed.
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);

    const afterDrag = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(afterDrag.artboards[0], layer.id)?.opacity).toBeCloseTo(0.3);

    // Undo restores the pre-drag opacity in a single step.
    undoProject(project.id);
    const undone = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(undone.artboards[0], layer.id)?.opacity).toBe(1);
  });

  it('keeps discrete edits as separate undo steps when not coalescing', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const layer = createShapeLayer('rect', 0, 0, 200, 200);
    commitProject(project, [layer]);

    updateLayerInActiveArtboard(project.id, layer.id, { opacity: 0.5 });
    updateLayerInActiveArtboard(project.id, layer.id, { opacity: 0.2 });

    expect(historyStore.getState().histories[project.id].past).toHaveLength(2);
  });

  it('bulk-edits a shared property across the whole selection in one step', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const a = createShapeLayer('rect', 0, 0, 100, 100);
    const b = createTextLayer(project, 0, 0);
    commitProject(project, [a, b]);

    updateLayersInActiveArtboard(project.id, [a.id, b.id], { opacity: 0.4 });

    const current = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(current.artboards[0], a.id)?.opacity).toBeCloseTo(0.4);
    expect(findLayerInArtboard(current.artboards[0], b.id)?.opacity).toBeCloseTo(0.4);
    // One undoable step for the whole bulk edit.
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
  });

  it('only applies type-specific bulk edits to compatible layers', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const shape = createShapeLayer('rect', 0, 0, 100, 100);
    const text = createTextLayer(project, 0, 0);
    commitProject(project, [shape, text]);

    // A fill patch on a mixed selection must not corrupt the text layer, and a
    // style patch must not touch the shape layer.
    updateLayersInActiveArtboard(project.id, [shape.id, text.id], {
      fill: { type: 'solid', color: '#FF0000' },
      style: { fontSize: 64 },
    });

    const current = projectStore.getState().projects[project.id];
    const updatedShape = findLayerInArtboard(current.artboards[0], shape.id);
    const updatedText = findLayerInArtboard(current.artboards[0], text.id);
    expect(updatedShape?.type).toBe('shape');
    if (updatedShape?.type === 'shape') {
      expect(updatedShape.fill).toEqual({ type: 'solid', color: '#FF0000' });
    }
    expect(updatedText?.type).toBe('text');
    if (updatedText?.type === 'text') {
      expect(updatedText.style.fontSize).toBe(64);
      // The shape's fill patch left no stray fill on the text layer.
      expect('fill' in updatedText).toBe(false);
    }
  });

  it('ignores an empty bulk selection', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    commitProject(project, []);
    updateLayersInActiveArtboard(project.id, [], { opacity: 0.5 });
    expect(historyStore.getState().histories[project.id]).toBeUndefined();
  });
});
