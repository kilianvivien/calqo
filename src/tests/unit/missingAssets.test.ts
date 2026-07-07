import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalqoAssetRef, ImageLayer, SvgLayer } from '@/lib/schema';

const adapterMocks = vi.hoisted(() => ({
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    getAssetMeta: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
  dialog: { confirm: vi.fn() },
  storage: {
    saveProject: vi.fn(),
    getProject: vi.fn(),
    deleteProject: vi.fn(),
    listProjects: vi.fn(),
  },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

import {
  collectAssetUsage,
  detectMissingAssets,
  findMissingAssets,
} from '@/editor/assets/missingAssets';
import {
  relinkAsset,
  removeLayersForAsset,
  undoProject,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { createDefaultProject, type CalqoProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';

function rasterRef(id: string): CalqoAssetRef {
  return {
    id,
    kind: 'raster',
    name: `${id}.png`,
    mimeType: 'image/png',
    width: 400,
    height: 300,
    storageKey: id,
    createdAt: '2026-07-01T00:00:00.000Z',
  };
}

function imageLayer(id: string, assetId: string): ImageLayer {
  return {
    id,
    name: `Image ${id}`,
    type: 'image',
    x: 10,
    y: 20,
    w: 200,
    h: 150,
    rotation: 12,
    opacity: 0.9,
    visible: true,
    locked: false,
    assetId,
    fit: 'cover',
    crop: { x: 1, y: 2, w: 90, h: 70 },
    focalPoint: { x: 0.3, y: 0.7 },
    mask: { shape: 'rounded', radius: 10 },
    filters: { brightness: 0.1 },
    frame: { kind: 'polaroid', color: '#FFFFFF', width: 12 },
  };
}

function svgLayer(id: string, assetId: string): SvgLayer {
  return {
    id,
    name: `Svg ${id}`,
    type: 'svg',
    x: 0,
    y: 0,
    w: 48,
    h: 48,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    assetId,
  };
}

function buildProject(): CalqoProject {
  const project = createDefaultProject();
  project.assets.push(rasterRef('asset-a'));
  project.artboards[0].layers.push(
    imageLayer('layer-1', 'asset-a'),
    imageLayer('layer-2', 'asset-a'),
    svgLayer('layer-3', 'asset-b'),
  );
  return project;
}

afterEach(() => {
  projectStore.setState({ projects: {}, saveState: {} });
  historyStore.setState({ histories: {} });
  selectionStore.setState({
    activeArtboardId: null,
    selectedLayerIds: [],
    hoveredLayerId: null,
  });
});

describe('findMissingAssets', () => {
  it('reports assets whose blobs are unavailable, grouped with layer refs', () => {
    const project = buildProject();
    const missing = findMissingAssets(project, new Set(['asset-b']));
    expect(missing).toHaveLength(1);
    expect(missing[0].assetId).toBe('asset-a');
    expect(missing[0].kind).toBe('image');
    expect(missing[0].name).toBe('asset-a.png');
    expect(missing[0].layerRefs.map((ref) => ref.layerId)).toEqual([
      'layer-1',
      'layer-2',
    ]);
  });

  it('infers svg kind from the referencing layer when the manifest ref is gone', () => {
    const project = buildProject();
    const missing = findMissingAssets(project, new Set(['asset-a']));
    expect(missing).toHaveLength(1);
    expect(missing[0].assetId).toBe('asset-b');
    expect(missing[0].kind).toBe('svg');
    expect(missing[0].name).toBeUndefined();
  });

  it('returns nothing for a project with zero assets', () => {
    const project = createDefaultProject();
    expect(collectAssetUsage(project).size).toBe(0);
    expect(findMissingAssets(project, new Set())).toEqual([]);
  });

  it('tracks background and fill references too', () => {
    const project = createDefaultProject();
    project.artboards[0].background = {
      type: 'image',
      assetId: 'asset-bg',
      fit: 'cover',
    };
    project.artboards[0].layers.push({
      id: 'shape-1',
      name: 'Filled',
      type: 'shape',
      shape: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fill: { type: 'image', assetId: 'asset-fill', fit: 'cover' },
    });
    const missing = findMissingAssets(project, new Set());
    expect(missing.map((entry) => entry.assetId).sort()).toEqual([
      'asset-bg',
      'asset-fill',
    ]);
    expect(missing.find((e) => e.assetId === 'asset-bg')?.layerRefs[0].role).toBe(
      'background',
    );
    expect(missing.find((e) => e.assetId === 'asset-fill')?.layerRefs[0].role).toBe(
      'fill',
    );
  });
});

describe('detectMissingAssets', () => {
  it('checks blob availability through the asset adapter', async () => {
    const project = buildProject();
    adapterMocks.assetStorage.getAssetBlob.mockImplementation(
      async (assetId: string) =>
        assetId === 'asset-a' ? new Blob(['x'], { type: 'image/png' }) : null,
    );
    const missing = await detectMissingAssets(project);
    expect(missing.map((entry) => entry.assetId)).toEqual(['asset-b']);
  });
});

describe('relinkAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapterMocks.assetStorage.saveAsset.mockResolvedValue(rasterRef('asset-new'));
  });

  it('rewrites every reference in one undoable step and preserves layer styling', async () => {
    const project = buildProject();
    const before = structuredClone(
      findLayerInArtboard(project.artboards[0], 'layer-1'),
    ) as ImageLayer;
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);

    const newRef = await relinkAsset(
      project.id,
      'asset-a',
      new Blob(['img'], { type: 'image/png' }),
      { kind: 'raster', name: 'new.png', mimeType: 'image/png' },
    );
    expect(newRef?.id).toBe('asset-new');

    const current = projectStore.getState().projects[project.id];
    const layer1 = findLayerInArtboard(current.artboards[0], 'layer-1') as ImageLayer;
    const layer2 = findLayerInArtboard(current.artboards[0], 'layer-2') as ImageLayer;
    expect(layer1.assetId).toBe('asset-new');
    expect(layer2.assetId).toBe('asset-new');
    // Geometry, frame, mask, filters, crop, and focal point are untouched.
    expect({ x: layer1.x, y: layer1.y, w: layer1.w, h: layer1.h, rotation: layer1.rotation }).toEqual(
      { x: before.x, y: before.y, w: before.w, h: before.h, rotation: before.rotation },
    );
    expect(layer1.crop).toEqual(before.crop);
    expect(layer1.focalPoint).toEqual(before.focalPoint);
    expect(layer1.mask).toEqual(before.mask);
    expect(layer1.filters).toEqual(before.filters);
    expect(layer1.frame).toEqual(before.frame);
    // Manifest swapped old for new.
    expect(current.assets.some((ref) => ref.id === 'asset-a')).toBe(false);
    expect(current.assets.some((ref) => ref.id === 'asset-new')).toBe(true);

    // Exactly one undo step restores the old references.
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
    undoProject(project.id);
    const undone = projectStore.getState().projects[project.id];
    expect(
      (findLayerInArtboard(undone.artboards[0], 'layer-1') as ImageLayer).assetId,
    ).toBe('asset-a');
  });
});

describe('removeLayersForAsset', () => {
  it('removes rendering layers, resets backgrounds and markers, drops the manifest entry', () => {
    const project = buildProject();
    project.artboards[0].background = {
      type: 'image',
      assetId: 'asset-a',
      fit: 'cover',
    };
    project.artboards[0].layers.push({
      id: 'list-1',
      name: 'List',
      type: 'list',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      items: [{ id: 'row-1', text: { en: 'hello' } }],
      marker: { kind: 'asset', assetId: 'asset-a', color: '#111827' },
      markerGap: 8,
      style: {
        fontFamily: 'Inter',
        fontSize: 30,
        fontWeight: 500,
        fontStyle: 'normal',
        textDecoration: 'none',
        color: '#111827',
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    });
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);

    removeLayersForAsset(project.id, 'asset-a');

    const current = projectStore.getState().projects[project.id];
    const artboard = current.artboards[0];
    expect(findLayerInArtboard(artboard, 'layer-1')).toBeFalsy();
    expect(findLayerInArtboard(artboard, 'layer-2')).toBeFalsy();
    // Unrelated layers survive; the list keeps its rows with a bullet marker.
    expect(findLayerInArtboard(artboard, 'layer-3')).toBeTruthy();
    const list = findLayerInArtboard(artboard, 'list-1');
    expect(list && list.type === 'list' && list.marker.kind).toBe('bullet');
    expect(artboard.background).toEqual({ type: 'solid', color: '#FFFFFF' });
    expect(current.assets.some((ref) => ref.id === 'asset-a')).toBe(false);
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
  });
});
