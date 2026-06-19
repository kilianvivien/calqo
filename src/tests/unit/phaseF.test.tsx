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
} from '@/editor/commands/projectCommands';
import { importProjectFile } from '@/editor/export/calqoFile';
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

  it('normalizes stale provider ids back to mock settings', () => {
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

    expect(normalized.providerId).toBe('mock');
    expect(normalized.providers.mock).toBeDefined();
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
    expect(screen.getByText(/works offline/i)).toBeInTheDocument();
  });
});
