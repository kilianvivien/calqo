import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpOperationError } from '@/editor/mcp/operationSchemas';
import { executeApplyOperations } from '@/editor/mcp/executor';
import { undoProject } from '@/editor/commands/projectCommands';
import {
  createArtboard,
  createDefaultProject,
  type CalqoProject,
} from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';

/**
 * AN-4.3 validated AI/MCP animation operations. These route through the same
 * simulate→commit executor path as every other agent edit, so the assertions
 * focus on: the resulting document, the shared validation gate rejecting bad
 * timing/scenes, undo behaviour, and that gated (text-reveal) presets stay
 * unreachable through the agent surface.
 */

function textLayer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Text',
    type: 'text',
    x: 40,
    y: 40,
    w: 400,
    h: 120,
    text: { en: 'Hello' },
    style: {},
    ...overrides,
  };
}

/** Open a project with a text layer and (optionally) a second same-size artboard
 * for scene tests. */
function openProject(withSecondArtboard = false): CalqoProject {
  const project = createDefaultProject({ name: 'Anim MCP test' });
  const first = project.artboards[0];
  first.timing = { duration: 5000 };
  first.layers.push(textLayer('layer_headline') as never);
  if (withSecondArtboard) {
    const second = createArtboard(first.preset, 'Scene 2');
    second.width = first.width;
    second.height = first.height;
    project.artboards.push(second);
  }
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  selectionStore.getState().setActiveArtboard(first.id);
  return project;
}

function currentProject(id: string): CalqoProject {
  return projectStore.getState().projects[id];
}

function firstLayer(id: string) {
  return currentProject(id).artboards[0].layers.find((l) => l.id === 'layer_headline');
}

function expectMcpError(fn: () => unknown, code: string): McpOperationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(McpOperationError);
    expect((error as McpOperationError).payload.code).toBe(code);
    return error as McpOperationError;
  }
  throw new Error(`expected ${code} error`);
}

beforeEach(() => {
  vi.useFakeTimers();
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
  workspaceStore.setState({ openTabIds: [], activeProjectId: null });
});

describe('AN-4.3 preset operations', () => {
  it('sets an enter preset on a layer and undoes it in one step', () => {
    const project = openProject();
    const result = executeApplyOperations({
      operations: [
        {
          type: 'setLayerPreset',
          layerId: 'layer_headline',
          slot: 'enter',
          preset: { kind: 'rise', duration: 600, delay: 0, direction: 'up', distance: 80 },
        },
      ],
    });
    expect(result.ok).toBe(true);
    const layer = firstLayer(project.id);
    expect(layer?.animation).toMatchObject({
      mode: 'preset',
      enter: { kind: 'rise', duration: 600 },
    });

    undoProject(project.id);
    expect(firstLayer(project.id)?.animation).toBeUndefined();
  });

  it('rejects a preset whose window exceeds the scene', () => {
    const project = openProject();
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            {
              type: 'setLayerPreset',
              layerId: 'layer_headline',
              slot: 'enter',
              // 6000ms window inside a 5000ms scene.
              preset: { kind: 'fade', duration: 6000, delay: 0 },
            },
          ],
        }),
      'VALIDATION_FAILED',
    );
    // Nothing committed.
    expect(firstLayer(project.id)?.animation).toBeUndefined();
  });

  it('clears one slot with preset:null and removes empty animation', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'setLayerPreset', layerId: 'layer_headline', slot: 'enter', preset: { kind: 'fade', duration: 500, delay: 0 } },
      ],
    });
    executeApplyOperations({
      operations: [
        { type: 'setLayerPreset', layerId: 'layer_headline', slot: 'enter', preset: null },
      ],
    });
    expect(firstLayer(project.id)?.animation).toBeUndefined();
  });

  it('clearLayerAnimation strips all animation', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'setLayerPreset', layerId: 'layer_headline', slot: 'enter', preset: { kind: 'pop', duration: 500, delay: 0 } },
        { type: 'setLayerPreset', layerId: 'layer_headline', slot: 'emphasis', preset: { kind: 'pulse', duration: 900, delay: 0 } },
      ],
    });
    expect(firstLayer(project.id)?.animation).toBeDefined();
    executeApplyOperations({
      operations: [{ type: 'clearLayerAnimation', layerId: 'layer_headline' }],
    });
    expect(firstLayer(project.id)?.animation).toBeUndefined();
  });

  it('rejects gated text-reveal presets through the agent surface', () => {
    openProject();
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            { type: 'setLayerPreset', layerId: 'layer_headline', slot: 'enter', preset: { kind: 'typewriter', duration: 800, delay: 0 } },
          ],
        }),
      'VALIDATION_FAILED',
    );
  });

  it('rejects an unknown layer id', () => {
    openProject();
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            { type: 'setLayerPreset', layerId: 'nope', slot: 'enter', preset: { kind: 'fade', duration: 500, delay: 0 } },
          ],
        }),
      'LAYER_NOT_FOUND',
    );
  });
});

describe('AN-4.3 custom windows', () => {
  it('sets custom track windows within the scene', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        {
          type: 'setLayerCustomWindows',
          layerId: 'layer_headline',
          windows: [
            {
              start: 0,
              duration: 1000,
              tracks: [
                { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] },
              ],
            },
          ],
        },
      ],
    });
    expect(firstLayer(project.id)?.animation).toMatchObject({ mode: 'custom' });
  });

  it('rejects a custom window that falls outside the scene', () => {
    const project = openProject();
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            {
              type: 'setLayerCustomWindows',
              layerId: 'layer_headline',
              windows: [
                {
                  start: 4500,
                  duration: 1000, // ends at 5500ms, past the 5000ms scene
                  tracks: [
                    { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] },
                  ],
                },
              ],
            },
          ],
        }),
      'VALIDATION_FAILED',
    );
    expect(firstLayer(project.id)?.animation).toBeUndefined();
  });
});

describe('AN-4.3 scene and clip operations', () => {
  it('sets scene duration and clip fps', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'setSceneDuration', durationMs: 3000 },
        { type: 'setClipFps', fps: 60 },
      ],
    });
    const current = currentProject(project.id);
    expect(current.artboards[0].timing?.duration).toBe(3000);
    expect(current.clipSettings?.fps).toBe(60);
  });

  it('builds, reorders, and transitions a multi-scene clip', () => {
    const project = openProject(true);
    const [ab1, ab2] = currentProject(project.id).artboards;
    executeApplyOperations({
      operations: [
        {
          type: 'setClipScenes',
          scenes: [{ artboardId: ab1.id }, { artboardId: ab2.id, transition: 'fade', transitionDurationMs: 400 }],
        },
      ],
    });
    let scenes = currentProject(project.id).clipSettings?.scenes;
    expect(scenes).toHaveLength(2);
    expect(scenes?.[1]).toMatchObject({ artboardId: ab2.id, transition: 'fade' });

    executeApplyOperations({ operations: [{ type: 'reorderScene', from: 0, to: 1 }] });
    scenes = currentProject(project.id).clipSettings?.scenes;
    expect(scenes?.[0].artboardId).toBe(ab2.id);

    executeApplyOperations({
      operations: [{ type: 'setSceneTransition', index: 1, transition: 'slide', transitionDurationMs: 300 }],
    });
    scenes = currentProject(project.id).clipSettings?.scenes;
    expect(scenes?.[1]).toMatchObject({ transition: 'slide', transitionDurationMs: 300 });
  });

  it('rejects a duplicate artboard in the scene list', () => {
    const project = openProject(true);
    const [ab1] = currentProject(project.id).artboards;
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            { type: 'setClipScenes', scenes: [{ artboardId: ab1.id }, { artboardId: ab1.id }] },
          ],
        }),
      'VALIDATION_FAILED',
    );
  });

  it('rejects a scene list that exceeds 60s total', () => {
    const project = openProject(true);
    const [ab1, ab2] = currentProject(project.id).artboards;
    // Make each scene 40s so two scenes exceed the 60s cap.
    executeApplyOperations({
      operations: [
        { type: 'setSceneDuration', durationMs: 40000, artboardId: ab1.id },
        { type: 'setSceneDuration', durationMs: 40000, artboardId: ab2.id },
      ],
    });
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [{ type: 'setClipScenes', scenes: [{ artboardId: ab1.id }, { artboardId: ab2.id }] }],
        }),
      'VALIDATION_FAILED',
    );
  });

  it('clears the multi-scene clip with an empty scene list', () => {
    const project = openProject(true);
    const [ab1, ab2] = currentProject(project.id).artboards;
    executeApplyOperations({
      operations: [{ type: 'setClipScenes', scenes: [{ artboardId: ab1.id }, { artboardId: ab2.id }] }],
    });
    executeApplyOperations({ operations: [{ type: 'setClipScenes', scenes: [] }] });
    expect(currentProject(project.id).clipSettings?.scenes).toBeUndefined();
  });
});
