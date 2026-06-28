import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CalqoAssetRef,
  ImageBackgroundRemovalPass,
  ImageLayer,
} from '@/lib/schema';

const adapterMocks = vi.hoisted(() => ({
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
  dialog: {
    confirm: vi.fn(),
  },
  storage: {
    saveProject: vi.fn(),
    getProject: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

const processorMocks = vi.hoisted(() => ({
  removeBackgroundFromBlob: vi.fn(),
}));

vi.mock('@/lib/adapters', () => adapterMocks);
vi.mock('@/editor/images/backgroundRemoval', () => processorMocks);

import {
  applyImageBackgroundRemovalPasses,
  replaceLayerAsset,
  resetImageBackgroundRemoval,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { createDefaultProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';

const pass: ImageBackgroundRemovalPass = {
  id: 'pass-1',
  color: '#FFFFFF',
  tolerance: 12,
  softness: 18,
  mode: 'connected',
};

function rasterAsset(id: string): CalqoAssetRef {
  return {
    id,
    kind: 'raster',
    name: `${id}.png`,
    mimeType: 'image/png',
    width: 100,
    height: 80,
    storageKey: id,
    createdAt: '2026-06-28T00:00:00.000Z',
  };
}

function imageLayer(): ImageLayer {
  return {
    id: 'image-1',
    name: 'Logo',
    type: 'image',
    x: 10,
    y: 20,
    w: 100,
    h: 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    assetId: 'asset-source',
    fit: 'contain',
    crop: { x: 1, y: 2, w: 90, h: 70 },
    focalPoint: { x: 0.4, y: 0.6 },
    mask: { shape: 'rounded', radius: 8 },
    filters: { brightness: 0.2 },
    frame: { kind: 'rounded', color: '#FFFFFF', width: 8 },
  };
}

describe('background removal commands', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const source = new Blob(['source'], { type: 'image/png' });
    const result = new Blob(['result'], { type: 'image/png' });
    adapterMocks.assetStorage.getAssetBlob.mockResolvedValue(source);
    adapterMocks.assetStorage.saveAsset.mockResolvedValue(rasterAsset('asset-result'));
    processorMocks.removeBackgroundFromBlob.mockResolvedValue({
      blob: result,
      width: 100,
      height: 80,
    });
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

  it('generates a transparent derivative and preserves image-layer edits', async () => {
    const project = createDefaultProject();
    const layer = imageLayer();
    project.assets.push(rasterAsset('asset-source'));
    project.artboards[0].layers.push(layer);
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);
    selectionStore.getState().selectOne(layer.id);

    await applyImageBackgroundRemovalPasses(project.id, layer.id, [pass]);

    const current = projectStore.getState().projects[project.id];
    const updated = findLayerInArtboard(current.artboards[0], layer.id) as ImageLayer;
    expect(processorMocks.removeBackgroundFromBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      [pass],
    );
    expect(updated.assetId).toBe('asset-result');
    expect(updated.backgroundRemoval?.source.assetId).toBe('asset-source');
    expect(updated.backgroundRemoval?.result?.assetId).toBe('asset-result');
    expect(updated.crop).toEqual(layer.crop);
    expect(updated.mask).toEqual(layer.mask);
    expect(updated.filters).toEqual(layer.filters);
    expect(updated.frame).toEqual(layer.frame);
    expect(selectionStore.getState().selectedLayerIds).toEqual([layer.id]);
    expect(current.assets.some((asset) => asset.id === 'asset-result')).toBe(true);
  });

  it('reset restores the original source asset', async () => {
    const project = createDefaultProject();
    const layer = imageLayer();
    layer.assetId = 'asset-result';
    layer.backgroundRemoval = {
      source: { assetId: 'asset-source' },
      result: { assetId: 'asset-result' },
      passes: [pass],
    };
    project.artboards[0].layers.push(layer);
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);

    resetImageBackgroundRemoval(project.id, layer.id);

    const current = projectStore.getState().projects[project.id];
    const updated = findLayerInArtboard(current.artboards[0], layer.id) as ImageLayer;
    expect(updated.assetId).toBe('asset-source');
    expect(updated.backgroundRemoval).toBeUndefined();
  });

  it('replace asset clears background-removal metadata', () => {
    const project = createDefaultProject();
    const layer = imageLayer();
    layer.backgroundRemoval = {
      source: { assetId: 'asset-source' },
      result: { assetId: 'asset-result' },
      passes: [pass],
    };
    project.artboards[0].layers.push(layer);
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);

    replaceLayerAsset(project.id, layer.id, rasterAsset('asset-next'));

    const current = projectStore.getState().projects[project.id];
    const updated = findLayerInArtboard(current.artboards[0], layer.id) as ImageLayer;
    expect(updated.assetId).toBe('asset-next');
    expect(updated.backgroundRemoval).toBeUndefined();
  });
});
