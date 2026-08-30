import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  normalizeAiSettings,
  useAiSettingsStore,
} from '@/editor/ai/aiSettings';
import {
  closeProject,
  editProject,
  flushPendingSaves,
  saveProject,
  isProjectDirty,
  requestCloseProject,
} from '@/editor/commands/projectCommands';
import {
  importProjectFile,
  importProjectText,
  dataUrlToBlob,
  saveNativeProjectFile,
} from '@/editor/export/calqoFile';
import { desktopFileStore } from '@/lib/state/desktopFileStore';
import { AppSettingsModal } from '@/app/shell/AppSettingsModal';
import { createDefaultProject } from '@/lib/schema';
import { projectStore } from '@/lib/state/projectStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import { historyStore } from '@/lib/state/historyStore';
import { selectionStore } from '@/lib/state/selectionStore';

const adapterMocks = vi.hoisted(() => ({
  storage: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    saveProject: vi.fn(),
    deleteProject: vi.fn(),
  },
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
  files: {
    openCalqoFile: vi.fn(),
    downloadBlob: vi.fn(),
    downloadMany: vi.fn(),
    writeTextFileToDisk: vi.fn(),
    saveTextFileToDisk: vi.fn(),
  },
  clipboard: {
    writePng: vi.fn(),
    canWritePng: vi.fn(),
    writeImage: vi.fn(),
    canWriteImages: vi.fn(),
    writeText: vi.fn(),
  },
  fonts: {
    listFonts: vi.fn(),
    ensureLoaded: vi.fn(),
  },
  appSettings: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

function resetState() {
  projectStore.setState({ projects: {}, saveState: {} });
  workspaceStore.setState({ openTabIds: [], activeProjectId: null });
  historyStore.setState({ histories: {} });
  desktopFileStore.setState({ files: {} });
  selectionStore.setState({
    activeArtboardId: null,
    selectedLayerIds: [],
    hoveredLayerId: null,
  });
  useAiSettingsStore.setState({
    settings: normalizeAiSettings(),
    loaded: false,
  });
}

describe('phase F — persistence hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    adapterMocks.storage.saveProject.mockResolvedValue(undefined);
    adapterMocks.appSettings.set.mockResolvedValue(undefined);
    resetState();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetState();
  });

  it('keeps native disk state dirty when edits arrive during a write', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    desktopFileStore.getState().linkFile(project.id, '/test.calqo');
    let finish!: () => void;
    adapterMocks.files.writeTextFileToDisk.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const save = saveNativeProjectFile(project.id);
    await vi.waitFor(() => expect(finish).toBeDefined());
    editProject(project.id, (draft) => {
      draft.name = 'Later edit';
    });
    finish();
    expect(await save).toBe('/test.calqo');
    expect(desktopFileStore.getState().files[project.id].diskState).toBe(
      'unsaved',
    );
    await saveNativeProjectFile(project.id);
    expect(desktopFileStore.getState().files[project.id].diskState).toBe(
      'saved',
    );
    expect(
      JSON.parse(adapterMocks.files.writeTextFileToDisk.mock.lastCall![1])
        .project.name,
    ).toBe('Later edit');
  });

  it('retains the tab when a linked native file cannot be written', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    workspaceStore.getState().openTab(project.id, true);
    desktopFileStore.getState().linkFile(project.id, '/test.calqo', 'unsaved');
    adapterMocks.files.writeTextFileToDisk.mockRejectedValueOnce(
      new Error('Disk unavailable'),
    );
    expect(await closeProject(project.id)).toBe(false);
    expect(workspaceStore.getState().openTabIds).toContain(project.id);
    expect(desktopFileStore.getState().files[project.id].diskState).toBe(
      'error',
    );
  });

  it('imports repeated envelopes with independent asset ownership and references', async () => {
    const project = createDefaultProject();
    project.assets = [
      {
        id: 'original',
        kind: 'raster',
        mimeType: 'image/png',
        name: 'pixel.png',
        storageKey: 'original',
        createdAt: project.createdAt,
      },
    ];
    project.artboards[0].background = {
      type: 'image',
      assetId: 'original',
      fit: 'cover',
    };
    const text = JSON.stringify({
      kind: 'calqo.project',
      formatVersion: 1,
      project,
      assets: [{ id: 'original', dataUrl: 'data:image/png;base64,aGVsbG8=' }],
    });
    const first = await importProjectText(text);
    const second = await importProjectText(text);
    const one = projectStore.getState().projects[first];
    const two = projectStore.getState().projects[second];
    expect(first).not.toBe(second);
    expect(one.assets[0].id).not.toBe(two.assets[0].id);
    expect(one.assets[0].id).not.toBe('original');
    expect(one.artboards[0].background).toMatchObject({
      assetId: one.assets[0].id,
    });
    expect(two.artboards[0].background).toMatchObject({
      assetId: two.assets[0].id,
    });
    expect(adapterMocks.assetStorage.restoreAsset).toHaveBeenCalledTimes(2);
  });

  it('rejects remote asset URLs without issuing a network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      dataUrlToBlob('https://example.com/asset.png'),
    ).rejects.toThrow(/embedded/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('coalesces autosave stress edits into one adapter write', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);

    editProject(project.id, (draft) => {
      draft.name = 'One';
    });
    editProject(project.id, (draft) => {
      draft.name = 'Two';
    });
    editProject(project.id, (draft) => {
      draft.name = 'Three';
    });

    expect(projectStore.getState().saveState[project.id]).toBe('unsaved');
    await vi.advanceTimersByTimeAsync(700);

    expect(adapterMocks.storage.saveProject).toHaveBeenCalledTimes(1);
    expect(adapterMocks.storage.saveProject.mock.calls[0][0].name).toBe(
      'Three',
    );
    expect(projectStore.getState().saveState[project.id]).toBe('saved');
  });

  it('keeps a failed close recoverable, including the latest document and history', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    workspaceStore.getState().openTab(project.id, true);
    editProject(
      project.id,
      (draft) => {
        draft.name = 'Keep this edit';
      },
      { undoable: true },
    );
    adapterMocks.storage.saveProject.mockRejectedValue(
      new Error('Quota exceeded'),
    );
    expect(await requestCloseProject(project.id)).toBe(false);
    expect(projectStore.getState().projects[project.id].name).toBe(
      'Keep this edit',
    );
    expect(workspaceStore.getState().openTabIds).toContain(project.id);
    expect(
      historyStore.getState().histories[project.id].past.length,
    ).toBeGreaterThan(0);
    expect(isProjectDirty(project.id)).toBe(true);
    adapterMocks.storage.saveProject.mockResolvedValue(undefined);
    expect(await closeProject(project.id)).toBe(true);
    expect(projectStore.getState().projects[project.id]).toBeUndefined();
  });

  it('serializes overlapping saves and does not report an older edit as saved', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    adapterMocks.storage.saveProject
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSecond = resolve;
          }),
      );
    editProject(project.id, (draft) => {
      draft.name = 'First';
    });
    const first = saveProject(project.id);
    await Promise.resolve();
    editProject(project.id, (draft) => {
      draft.name = 'Latest';
    });
    const second = saveProject(project.id);
    expect(adapterMocks.storage.saveProject).toHaveBeenCalledTimes(1);
    finishFirst();
    await Promise.resolve();
    expect(projectStore.getState().saveState[project.id]).not.toBe('saved');
    expect(adapterMocks.storage.saveProject.mock.calls[1][0].name).toBe(
      'Latest',
    );
    finishSecond();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(projectStore.getState().saveState[project.id]).toBe('saved');
  });

  it('flushes dirty edits before closing a tab', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    workspaceStore.getState().openTab(project.id, true);

    editProject(project.id, (draft) => {
      draft.name = 'Before close';
    });
    await closeProject(project.id);

    expect(adapterMocks.storage.saveProject).toHaveBeenCalledTimes(1);
    expect(adapterMocks.storage.saveProject.mock.calls[0][0].name).toBe(
      'Before close',
    );
    expect(workspaceStore.getState().openTabIds).toEqual([]);
    expect(projectStore.getState().projects[project.id]).toBeUndefined();
  });

  it('flushes pending autosaves for reload and beforeunload paths', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);

    editProject(project.id, (draft) => {
      draft.name = 'Reload-safe';
    });
    await flushPendingSaves();

    expect(adapterMocks.storage.saveProject).toHaveBeenCalledTimes(1);
    expect(adapterMocks.storage.saveProject.mock.calls[0][0].name).toBe(
      'Reload-safe',
    );
    expect(projectStore.getState().saveState[project.id]).toBe('saved');
  });

  it('surfaces storage quota or adapter failures as a save error', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    adapterMocks.storage.saveProject.mockRejectedValueOnce(
      new DOMException('Quota exceeded', 'QuotaExceededError'),
    );

    await saveProject(project.id);

    expect(projectStore.getState().saveState[project.id]).toBe('error');
  });

  it('imports projects under a fresh id instead of clobbering an open one', async () => {
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    workspaceStore.getState().openTab(project.id, true);
    const file = {
      name: 'demo.calqo',
      type: 'application/json',
      text: () => Promise.resolve(JSON.stringify(project)),
    } as File;

    const importedId = await importProjectFile(file);

    expect(importedId).not.toBe(project.id);
    expect(projectStore.getState().projects[project.id]).toBeDefined();
    expect(projectStore.getState().projects[importedId]).toBeDefined();
    expect(workspaceStore.getState().activeProjectId).toBe(importedId);
  });
});

describe('phase F — settings hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapterMocks.appSettings.set.mockResolvedValue(undefined);
    resetState();
  });

  afterEach(resetState);

  it('normalizes stale provider ids back to the disabled "off" setting', () => {
    const normalized = normalizeAiSettings({
      providerId: 'openai' as never,
      providers: {
        openai: {
          model: 'gpt-4o',
          apiKey: 'old',
          baseUrl: 'https://api.openai.com/v1',
        },
      } as never,
    });

    expect(normalized.providerId).toBe('off');
    expect(normalized.providers.off).toBeDefined();
    expect(normalized.providers.local).toBeDefined();
  });

  it('opens the settings modal without crashing when loaded state is stale', async () => {
    useAiSettingsStore.setState({
      settings: {
        ...normalizeAiSettings(),
        providerId: 'openai' as never,
      },
      loaded: true,
    });

    render(<AppSettingsModal open onClose={() => undefined} />);

    expect(
      screen.getByRole('dialog', { name: /settings/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /ai provider/i }));
    expect(screen.getByText(/ai is turned off/i)).toBeInTheDocument();
  });
});
