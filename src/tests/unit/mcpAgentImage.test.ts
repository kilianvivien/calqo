import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeAgentImageDataUrl,
  executeInsertAgentImage,
} from '@/editor/mcp/agentImage';
import { McpOperationError } from '@/editor/mcp/operationSchemas';
import { undoProject } from '@/editor/commands/projectCommands';
import { createDefaultProject, type CalqoProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';

const adapterMocks = vi.hoisted(() => ({
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    getAssetMeta: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

class FakeImage {
  naturalWidth = 1024;
  naturalHeight = 768;
  onload: (() => void) | null = null;

  set src(_url: string) {
    this.onload?.();
  }
}

function openProject(): CalqoProject {
  const project = createDefaultProject({ name: 'Agent image test' });
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  return project;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('Image', FakeImage);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:agent-image'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  adapterMocks.assetStorage.saveAsset.mockResolvedValue({
    id: 'asset-agent-1',
    kind: 'raster',
    name: 'hero.png',
    mimeType: 'image/png',
    width: 1024,
    height: 768,
    storageKey: 'asset-agent-1',
    createdAt: '2026-07-15T00:00:00.000Z',
  });
  adapterMocks.assetStorage.deleteAsset.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectURL,
  });
  projectStore.setState({ projects: {}, saveState: {} });
  historyStore.setState({ histories: {} });
  selectionStore.setState({
    activeArtboardId: null,
    selectedLayerIds: [],
    hoveredLayerId: null,
  });
  workspaceStore.setState({ openTabIds: [], activeProjectId: null });
});

describe('MCP agent image import', () => {
  it('accepts supported data URLs and rejects URLs or spoofed MIME types', () => {
    expect(decodeAgentImageDataUrl(PNG_DATA_URL).mimeType).toBe('image/png');

    expect(() =>
      decodeAgentImageDataUrl('https://example.com/photo.png'),
    ).toThrow(McpOperationError);
    expect(() =>
      decodeAgentImageDataUrl('data:image/jpeg;base64,iVBORw0KGgo='),
    ).toThrow(/do not match/);
  });

  it('stores and places an image as one undoable project change', async () => {
    const project = openProject();
    const artboard = project.artboards[0];
    const result = await executeInsertAgentImage({
      dataUrl: PNG_DATA_URL,
      name: 'hero.png',
      x: 80,
      y: 120,
      w: 640,
      h: 480,
      fit: 'contain',
    });

    expect(adapterMocks.assetStorage.saveAsset).toHaveBeenCalledWith(
      project.id,
      expect.any(Blob),
      {
        name: 'hero.png',
        mimeType: 'image/png',
        kind: 'raster',
        width: 1024,
        height: 768,
      },
    );
    const current = projectStore.getState().projects[project.id];
    expect(current.assets).toEqual([
      expect.objectContaining({ id: 'asset-agent-1' }),
    ]);
    expect(current.artboards[0].layers).toEqual([
      expect.objectContaining({
        id: result.layerId,
        type: 'image',
        assetId: 'asset-agent-1',
        x: 80,
        y: 120,
        w: 640,
        h: 480,
        fit: 'contain',
      }),
    ]);
    expect(result.artboardId).toBe(artboard.id);
    expect(selectionStore.getState().selectedLayerIds).toEqual([
      result.layerId,
    ]);

    undoProject(project.id);
    const undone = projectStore.getState().projects[project.id];
    expect(undone.assets).toHaveLength(0);
    expect(undone.artboards[0].layers).toHaveLength(0);
  });

  it('removes a newly stored blob if the base revision becomes stale', async () => {
    const project = openProject();
    const baseRevision = project.updatedAt;
    adapterMocks.assetStorage.saveAsset.mockImplementationOnce(async () => {
      projectStore.getState().upsertProject({
        ...projectStore.getState().projects[project.id],
        updatedAt: '2099-01-01T00:00:00.000Z',
      });
      return {
        id: 'asset-stale',
        kind: 'raster',
        name: 'stale.png',
        mimeType: 'image/png',
        width: 1024,
        height: 768,
        storageKey: 'asset-stale',
        createdAt: '2026-07-15T00:00:00.000Z',
      };
    });

    await expect(
      executeInsertAgentImage({
        dataUrl: PNG_DATA_URL,
        name: 'stale.png',
        baseRevision,
      }),
    ).rejects.toMatchObject({
      payload: { code: 'REVISION_MISMATCH' },
    });
    expect(adapterMocks.assetStorage.deleteAsset).toHaveBeenCalledWith(
      'asset-stale',
    );
    expect(
      projectStore.getState().projects[project.id].artboards[0].layers,
    ).toHaveLength(0);
  });
});
