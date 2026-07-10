import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alignSelectedLayers,
  alignSelectionToArtboard,
  distributeSelectedLayers,
  isProjectDirty,
  nudgeSelectedLayers,
  requestCloseProject,
  stackSelectedLayers,
  createShapeLayer,
} from '@/editor/commands/projectCommands';
import {
  alignBoxes,
  boundsOf,
  distributeBoxes,
  stackBoxes,
  type Box,
} from '@/editor/utils/arrange';
import { computeSnap } from '@/editor/canvas/snapping';
import {
  collectExportWarnings,
  uniqueArtboardStems,
} from '@/editor/export/exportReadiness';
import { findLayerInArtboard } from '@/editor/utils/layers';
import {
  createDefaultProject,
  type CalqoLayer,
  type CalqoProject,
} from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { useConfirmStore } from '@/lib/state/confirmStore';

function commitProject(project: CalqoProject, layers: CalqoLayer[]) {
  project.artboards[0].layers.push(...layers);
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
}

const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'calqo';

// Echo the key + interpolated params so warning assertions can match on key.
const echoT = (key: string) => key;

describe('phase K — arrange math', () => {
  it('aligns boxes to the shared bounding box', () => {
    const boxes: Box[] = [
      { id: 'a', x: 0, y: 0, w: 100, h: 50 },
      { id: 'b', x: 200, y: 100, w: 40, h: 40 },
    ];
    const ref = boundsOf(boxes);
    expect(ref).toEqual({ x: 0, y: 0, w: 240, h: 140 });

    expect(alignBoxes(boxes, 'left', ref)).toEqual([{ id: 'b', x: 0 }]);
    // b already sits at the right edge (200 + 40 = 240), so only a moves.
    expect(alignBoxes(boxes, 'right', ref)).toEqual([{ id: 'a', x: 140 }]);
    expect(alignBoxes(boxes, 'top', ref)).toEqual([{ id: 'b', y: 0 }]);
    expect(alignBoxes(boxes, 'middle', ref)).toEqual([
      { id: 'a', y: 45 },
      { id: 'b', y: 50 },
    ]);
  });

  it('distributes interior boxes to equal edge gaps and needs ≥3', () => {
    const boxes: Box[] = [
      { id: 'a', x: 0, y: 0, w: 20, h: 10 },
      { id: 'b', x: 30, y: 0, w: 20, h: 10 },
      { id: 'c', x: 100, y: 0, w: 20, h: 10 },
    ];
    // Total width 60, span 0..120 → free 60, gap 30 → b at 50.
    expect(distributeBoxes(boxes, 'horizontal')).toEqual([{ id: 'b', x: 50 }]);
    expect(distributeBoxes(boxes.slice(0, 2), 'horizontal')).toEqual([]);
  });

  it('stacks boxes in order with a fixed gap', () => {
    const boxes: Box[] = [
      { id: 'a', x: 0, y: 0, w: 20, h: 10 },
      { id: 'b', x: 5, y: 0, w: 30, h: 10 },
      { id: 'c', x: 3, y: 0, w: 10, h: 10 },
    ];
    // Sorted by x: a(0,20), c(3,10), b(5,30) with gap 10.
    expect(stackBoxes(boxes, 'horizontal', 10)).toEqual([
      { id: 'c', x: 30 },
      { id: 'b', x: 50 },
    ]);
  });
});

describe('phase K — smart guides', () => {
  const artboard = { width: 1000, height: 1000 };

  it('snaps an edge to another layer and emits a guide', () => {
    const result = computeSnap(
      { x: 103, y: 200, width: 50, height: 50 },
      [{ x: 100, y: 400, width: 50, height: 50 }],
      artboard,
      6,
    );
    expect(result.dx).toBe(-3);
    expect(result.guides).toContainEqual({ axis: 'x', position: 100 });
  });

  it('centers a layer between two flanking neighbours (equal spacing)', () => {
    // Left neighbour ends at x=100, right starts at x=400, moving width 50 →
    // ideal start = 100 + (250/2 - ... ) ; free = 400-100-50 = 250, ideal = 225.
    const result = computeSnap(
      { x: 222, y: 0, width: 50, height: 50 },
      [
        { x: 50, y: 0, width: 50, height: 50 },
        { x: 400, y: 0, width: 50, height: 50 },
      ],
      artboard,
      6,
    );
    expect(result.dx).toBeCloseTo(3);
    // Two spacing guides drawn for the matched gaps.
    expect(result.guides.filter((g) => g.axis === 'x')).toHaveLength(2);
  });

  it('does not snap when nothing is within threshold', () => {
    // 520 avoids the artboard edges/center lines (0 / 500 / 1000) and the lone
    // neighbour, which also can't form an equal-spacing pair on its own.
    const result = computeSnap(
      { x: 520, y: 520, width: 50, height: 50 },
      [{ x: 10, y: 10, width: 20, height: 20 }],
      artboard,
      6,
    );
    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.guides).toEqual([]);
  });
});

describe('phase K — export readiness', () => {
  it('dedupes batch filenames for duplicate artboard names', () => {
    const stems = uniqueArtboardStems(
      [{ name: 'Story' }, { name: 'Story' }, { name: 'Post' }, { name: 'Story' }],
      slug,
    );
    expect(stems).toEqual(['story-1', 'story-2', 'post', 'story-3']);
  });

  it('flags overflow, large assets, and large batches', () => {
    const project = createDefaultProject();
    project.assets.push({
      id: 'asset-big',
      kind: 'raster',
      name: 'huge.png',
      mimeType: 'image/png',
      width: 5000,
      height: 5000,
      storageKey: 'k',
      createdAt: new Date().toISOString(),
    });
    const artboard = project.artboards[0];
    artboard.layers.push(
      createShapeLayer('rect', -50, 0, 100, 100), // out of bounds
      { ...createShapeLayer('rect', 0, 0, 10, 10), type: 'image', assetId: 'asset-big', fit: 'cover' } as CalqoLayer,
    );

    const warnings = collectExportWarnings(
      { project, targets: [artboard], exportingAll: false },
      echoT,
    );
    expect(warnings).toContain('export.warnOverflow');
    expect(warnings).toContain('export.warnLargeAsset');

    const many = Array.from({ length: 13 }, () => project.artboards[0]);
    const batch = collectExportWarnings(
      { project, targets: many, exportingAll: true },
      echoT,
    );
    expect(batch).toContain('export.warnManyArtboards');
  });

  it('flags missing assets referenced from groups, fills, and backgrounds', () => {
    const project = createDefaultProject();
    const artboard = project.artboards[0];
    // No manifest entries at all: every reference below is broken.
    artboard.background = { type: 'image', assetId: 'asset-bg', fit: 'cover' };
    artboard.layers.push({
      id: 'group-1',
      name: 'Group',
      type: 'group',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      children: [
        {
          ...createShapeLayer('rect', 0, 0, 100, 100),
          type: 'image',
          assetId: 'asset-nested',
          fit: 'cover',
        } as CalqoLayer,
      ],
    } as CalqoLayer);
    artboard.layers.push({
      ...createShapeLayer('rect', 0, 0, 100, 100),
      fill: { type: 'image', assetId: 'asset-fill', fit: 'cover' },
    } as CalqoLayer);

    const warnings = collectExportWarnings(
      { project, targets: [artboard], exportingAll: false },
      echoT,
    );
    expect(warnings).toContain('export.warnMissingAsset');
  });
});

describe('phase K — arrange commands', () => {
  afterEach(() => {
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
    vi.useRealTimers();
  });

  it('aligns selected layers in one undoable step, skipping locked/hidden', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const a = createShapeLayer('rect', 0, 0, 100, 100);
    const b = createShapeLayer('rect', 300, 0, 100, 100);
    const lockedC = { ...createShapeLayer('rect', 500, 0, 100, 100), locked: true };
    commitProject(project, [a, b, lockedC]);
    selectionStore.getState().setSelection([a.id, b.id, lockedC.id]);

    alignSelectedLayers(project.id, 'left');

    const current = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(current.artboards[0], a.id)?.x).toBe(0);
    expect(findLayerInArtboard(current.artboards[0], b.id)?.x).toBe(0);
    // Locked layer is untouched.
    expect(findLayerInArtboard(current.artboards[0], lockedC.id)?.x).toBe(500);
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
  });

  it('centers a single selected layer on the artboard (mobile align-to-canvas)', () => {
    vi.useFakeTimers();
    const project = createDefaultProject(); // 1080×1080 artboard
    const a = createShapeLayer('rect', 0, 0, 100, 100);
    commitProject(project, [a]);
    selectionStore.getState().setSelection([a.id]);

    alignSelectionToArtboard(project.id, 'center-h');
    alignSelectionToArtboard(project.id, 'middle');

    const current = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(current.artboards[0], a.id)?.x).toBe(490); // (1080-100)/2
    expect(findLayerInArtboard(current.artboards[0], a.id)?.y).toBe(490);

    alignSelectionToArtboard(project.id, 'right');
    expect(
      findLayerInArtboard(projectStore.getState().projects[project.id].artboards[0], a.id)?.x,
    ).toBe(980); // 1080-100
  });

  it('distributes only with ≥3 arrangeable layers', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const a = createShapeLayer('rect', 0, 0, 20, 20);
    const b = createShapeLayer('rect', 30, 0, 20, 20);
    const hidden = { ...createShapeLayer('rect', 60, 0, 20, 20), visible: false };
    const c = createShapeLayer('rect', 100, 0, 20, 20);
    commitProject(project, [a, b, hidden, c]);

    // With the hidden layer excluded there are 3 arrangeable layers.
    selectionStore.getState().setSelection([a.id, b.id, hidden.id, c.id]);
    distributeSelectedLayers(project.id, 'horizontal');
    const current = projectStore.getState().projects[project.id];
    // Hidden layer stays put; visible middle one is redistributed.
    expect(findLayerInArtboard(current.artboards[0], hidden.id)?.x).toBe(60);
    expect(findLayerInArtboard(current.artboards[0], b.id)?.x).toBe(50);
  });

  it('stacks selected layers into a column', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const a = createShapeLayer('rect', 0, 0, 40, 30);
    const b = createShapeLayer('rect', 0, 200, 40, 50);
    commitProject(project, [a, b]);
    selectionStore.getState().setSelection([a.id, b.id]);

    stackSelectedLayers(project.id, 'vertical', 10);
    const current = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(current.artboards[0], b.id)?.y).toBe(40); // 30 + gap 10
  });

  it('nudges unlocked selected layers by a delta, skipping locked', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const a = createShapeLayer('rect', 10, 10, 20, 20);
    const locked = { ...createShapeLayer('rect', 50, 50, 20, 20), locked: true };
    commitProject(project, [a, locked]);
    selectionStore.getState().setSelection([a.id, locked.id]);

    nudgeSelectedLayers(project.id, 5, -3);
    const current = projectStore.getState().projects[project.id];
    expect(findLayerInArtboard(current.artboards[0], a.id)?.x).toBe(15);
    expect(findLayerInArtboard(current.artboards[0], a.id)?.y).toBe(7);
    expect(findLayerInArtboard(current.artboards[0], locked.id)?.x).toBe(50);
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
  });
});

describe('phase K — warn before closing an unsaved project', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
  });

  const prompt = { title: 'Unsaved changes', message: 'Close anyway?' };

  it('does not prompt when the project is saved, and closes it', async () => {
    const project = createDefaultProject();
    commitProject(project, []);
    expect(isProjectDirty(project.id)).toBe(false);
    const confirmSpy = vi
      .spyOn(useConfirmStore.getState(), 'open')
      .mockResolvedValue(true);

    const closed = await requestCloseProject(project.id, prompt);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(closed).toBe(true);
    expect(projectStore.getState().projects[project.id]).toBeUndefined();
  });

  it('prompts on unsaved changes and keeps the project when declined', async () => {
    const project = createDefaultProject();
    commitProject(project, []);
    projectStore.getState().setSaveState(project.id, 'unsaved');
    expect(isProjectDirty(project.id)).toBe(true);
    const confirmSpy = vi
      .spyOn(useConfirmStore.getState(), 'open')
      .mockResolvedValue(false);

    const closed = await requestCloseProject(project.id, prompt);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(closed).toBe(false);
    // Declining keeps the tab/document intact.
    expect(projectStore.getState().projects[project.id]).toBeDefined();
  });

  it('prompts on unsaved changes and closes when confirmed', async () => {
    const project = createDefaultProject();
    commitProject(project, []);
    projectStore.getState().setSaveState(project.id, 'unsaved');
    const confirmSpy = vi
      .spyOn(useConfirmStore.getState(), 'open')
      .mockResolvedValue(true);

    const closed = await requestCloseProject(project.id, prompt);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(closed).toBe(true);
    expect(projectStore.getState().projects[project.id]).toBeUndefined();
  });
});
