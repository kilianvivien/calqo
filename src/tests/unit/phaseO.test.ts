import { describe, expect, it, beforeEach, vi } from 'vitest';
import i18n, { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { platformRuntime } from '@/lib/platform/runtime';
import {
  appCommandDefinitions,
  getAppCommandState,
  invokeAppCommand,
} from '@/app/commands/appCommands';
import {
  DEFAULT_AI_SETTINGS,
  toPersistedAiSettings,
} from '@/editor/ai/aiSettings';
import { createDefaultProject } from '@/lib/schema/defaults';
import type { CalqoLayer } from '@/lib/schema';
import { useProjectStore } from '@/lib/state/projectStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { useSelectionStore } from '@/lib/state/selectionStore';

describe('phase O — Tauri foundation contracts', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    const projectState = useProjectStore.getState();
    for (const id of Object.keys(projectState.projects)) {
      projectState.removeProject(id);
    }
    useWorkspaceStore
      .getState()
      .hydrate({ openTabIds: [], activeProjectId: null });
    useSelectionStore.getState().clearSelection();
  });

  it('defaults to browser capabilities outside Tauri', () => {
    expect(platformRuntime.kind).toBe('browser');
    expect(platformRuntime.capabilities.nativeMenus).toBe(false);
    expect(platformRuntime.capabilities.secureSettings).toBe(false);
    expect(platformRuntime.capabilities.localFonts).toBe(false);
  });

  it('detects Tauri v2 through the official global flag', async () => {
    const previous = (globalThis as typeof globalThis & { isTauri?: boolean })
      .isTauri;
    vi.resetModules();
    try {
      (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri = true;

      const { detectPlatformRuntime } = await import('@/lib/platform/runtime');
      const runtime = detectPlatformRuntime();

      expect(runtime.kind).toBe('tauri');
      expect(runtime.capabilities.secureSettings).toBe(true);
    } finally {
      if (previous === undefined) {
        delete (globalThis as typeof globalThis & { isTauri?: boolean })
          .isTauri;
      } else {
        (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri =
          previous;
      }
      vi.resetModules();
    }
  });

  it('reports command availability from workspace state', () => {
    expect(getAppCommandState('file.new').enabled).toBe(true);
    expect(getAppCommandState('file.save').enabled).toBe(false);
    expect(getAppCommandState('object.group').enabled).toBe(false);

    const project = createDefaultProject();
    project.artboards[0].layers = [
      {
        id: 'shape-one',
        name: 'Shape one',
        type: 'shape',
        shape: 'rect',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: { type: 'solid', color: '#000000' },
      },
      {
        id: 'shape-two',
        name: 'Shape two',
        type: 'shape',
        shape: 'ellipse',
        x: 120,
        y: 0,
        w: 100,
        h: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: { type: 'solid', color: '#FFFFFF' },
      },
    ] satisfies CalqoLayer[];
    useProjectStore.getState().upsertProject(project);
    useWorkspaceStore.getState().openTab(project.id, true);
    useSelectionStore
      .getState()
      .setSelection(
        project.artboards[0].layers.slice(0, 2).map((layer) => layer.id),
      );

    expect(getAppCommandState('file.save').enabled).toBe(true);
    expect(getAppCommandState('object.group').enabled).toBe(true);
    expect(getAppCommandState('edit.delete').enabled).toBe(true);
  });

  it('routes native edit commands to modal text controls', async () => {
    const clipboard = {
      readText: vi.fn().mockResolvedValue(' pasted'),
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const input = document.createElement('input');
    input.value = 'copy here';
    dialog.append(input);
    document.body.append(dialog);
    input.focus();
    input.setSelectionRange(0, 4);

    expect(getAppCommandState('edit.copy').enabled).toBe(true);
    await invokeAppCommand('edit.copy');
    expect(clipboard.writeText).toHaveBeenCalledWith('copy');

    input.setSelectionRange(input.value.length, input.value.length);
    await invokeAppCommand('edit.paste');
    expect(input.value).toBe('copy here pasted');
  });

  it('persists remembered API keys and strips unremembered keys', () => {
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

    expect(JSON.stringify(toPersistedAiSettings(settings, true))).toContain(
      'secret-key',
    );
    expect(JSON.stringify(toPersistedAiSettings(settings, false))).toContain(
      'secret-key',
    );
    expect(
      JSON.stringify(
        toPersistedAiSettings({ ...settings, storeKey: false }, false),
      ),
    ).not.toContain('secret-key');
  });

  it('has localized labels for every app command in English and French', () => {
    for (const lng of SUPPORTED_LANGUAGES) {
      for (const definition of appCommandDefinitions) {
        expect(i18n.exists(definition.labelKey, { lng })).toBe(true);
      }
    }
  });
});
