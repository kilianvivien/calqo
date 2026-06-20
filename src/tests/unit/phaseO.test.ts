import { describe, expect, it, beforeEach } from 'vitest';
import i18n, { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { platformRuntime } from '@/lib/platform/runtime';
import {
  appCommandDefinitions,
  getAppCommandState,
} from '@/app/commands/appCommands';
import {
  DEFAULT_AI_SETTINGS,
  toPersistedAiSettings,
} from '@/editor/ai/aiSettings';
import { createSampleProject } from '@/lib/schema/sampleProject';
import { useProjectStore } from '@/lib/state/projectStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { useSelectionStore } from '@/lib/state/selectionStore';

describe('phase O — Tauri foundation contracts', () => {
  beforeEach(() => {
    const projectState = useProjectStore.getState();
    for (const id of Object.keys(projectState.projects)) {
      projectState.removeProject(id);
    }
    useWorkspaceStore.getState().hydrate({ openTabIds: [], activeProjectId: null });
    useSelectionStore.getState().clearSelection();
  });

  it('defaults to browser capabilities outside Tauri', () => {
    expect(platformRuntime.kind).toBe('browser');
    expect(platformRuntime.capabilities.nativeMenus).toBe(false);
    expect(platformRuntime.capabilities.secureSettings).toBe(false);
    expect(platformRuntime.capabilities.localFonts).toBe(false);
  });

  it('reports command availability from workspace state', () => {
    expect(getAppCommandState('file.new').enabled).toBe(true);
    expect(getAppCommandState('file.save').enabled).toBe(false);
    expect(getAppCommandState('object.group').enabled).toBe(false);

    const project = createSampleProject('2026-06-20T00:00:00.000Z');
    useProjectStore.getState().upsertProject(project);
    useWorkspaceStore.getState().openTab(project.id, true);
    useSelectionStore
      .getState()
      .setSelection(project.artboards[0].layers.slice(0, 2).map((layer) => layer.id));

    expect(getAppCommandState('file.save').enabled).toBe(true);
    expect(getAppCommandState('object.group').enabled).toBe(true);
    expect(getAppCommandState('edit.delete').enabled).toBe(true);
  });

  it('strips API keys from secure desktop settings payloads', () => {
    const settings = {
      ...DEFAULT_AI_SETTINGS,
      storeKey: true,
      providers: {
        ...DEFAULT_AI_SETTINGS.providers,
        gemini: {
          ...DEFAULT_AI_SETTINGS.providers.gemini,
          apiKey: 'secret-key',
        },
      },
    };

    expect(JSON.stringify(toPersistedAiSettings(settings, true))).not.toContain(
      'secret-key',
    );
    expect(JSON.stringify(toPersistedAiSettings(settings, false))).toContain(
      'secret-key',
    );
  });

  it('has localized labels for every app command in English and French', () => {
    for (const lng of SUPPORTED_LANGUAGES) {
      for (const definition of appCommandDefinitions) {
        expect(i18n.exists(definition.labelKey, { lng })).toBe(true);
      }
    }
  });
});

