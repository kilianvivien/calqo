import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '@/lib/schema';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';

vi.mock('@/editor/export/rasterExport', () => ({
  exportArtboardRaster: vi.fn(
    async () =>
      ({
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }) as Blob,
  ),
}));

import { exportArtboardRaster } from '@/editor/export/rasterExport';
import { renderMcpPreview } from '@/editor/mcp/preview';

afterEach(() => {
  vi.clearAllMocks();
  projectStore.setState({ projects: {}, saveState: {} });
  selectionStore.setState({
    activeArtboardId: null,
    selectedLayerIds: [],
    hoveredLayerId: null,
  });
  workspaceStore.setState({ openTabIds: [], activeProjectId: null });
});

describe('MCP preview rendering', () => {
  it('renders a tall artboard once at the final bounded scale', async () => {
    const project = createDefaultProject({ preset: 'story' });
    projectStore.getState().upsertProject(project);
    workspaceStore.getState().openTab(project.id, true);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);

    const result = await renderMcpPreview({});

    expect(exportArtboardRaster).toHaveBeenCalledTimes(1);
    expect(exportArtboardRaster).toHaveBeenCalledWith(
      expect.objectContaining({ pixelRatio: 1024 / 1920 }),
    );
    expect(result).toMatchObject({ width: 576, height: 1024 });
  });
});
