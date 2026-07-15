import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyOperationsInputSchema,
  MAX_LAYERS_PER_ARTBOARD,
  McpOperationError,
} from '@/editor/mcp/operationSchemas';
import {
  executeApplyOperations,
  executeValidateOperations,
  projectRevision,
} from '@/editor/mcp/executor';
import { ensureWritePermission } from '@/editor/mcp/permissions';
import {
  serializeAppStatus,
  serializeProjectSummary,
} from '@/editor/mcp/contextSerializers';
import { undoProject } from '@/editor/commands/projectCommands';
import { createDefaultProject, type CalqoProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import { mcpStore, DEFAULT_MCP_SETTINGS } from '@/lib/state/mcpStore';
import { confirmStore } from '@/lib/state/confirmStore';

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

function shapeLayer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Panel',
    type: 'shape',
    shape: 'rect',
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    fill: { type: 'solid', color: '#E8B339' },
    ...overrides,
  };
}

function openProject(): CalqoProject {
  const project = createDefaultProject({ name: 'MCP test' });
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  return project;
}

function currentProject(id: string): CalqoProject {
  return projectStore.getState().projects[id];
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
  mcpStore.setState({
    settings: { ...DEFAULT_MCP_SETTINGS },
    sessionWriteGranted: false,
    activityLog: [],
    connectedClient: null,
    applying: false,
  });
  confirmStore.getState().respond(false);
});

describe('mcp operation schemas', () => {
  it('rejects unknown operation types', () => {
    const parsed = applyOperationsInputSchema.safeParse({
      operations: [{ type: 'nukeEverything' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown patch fields (strict)', () => {
    const parsed = applyOperationsInputSchema.safeParse({
      operations: [
        {
          type: 'updateLayer',
          layerId: 'a',
          patch: { x: 1, definitelyNotAField: true },
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects malformed layers in addLayer', () => {
    const parsed = applyOperationsInputSchema.safeParse({
      operations: [
        { type: 'addLayer', layer: { type: 'text', name: 'no geometry' } },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts stroke-only line layers and normalizes a transparent fill', () => {
    const parsed = applyOperationsInputSchema.safeParse({
      operations: [
        {
          type: 'addLayer',
          layer: {
            ...shapeLayer('layer_line', {
              shape: 'line',
              points: [0, 0, 200, 100],
              stroke: { color: '#FFFFFF', width: 4 },
            }),
            fill: undefined,
          },
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const operation = parsed.data.operations[0];
      expect(
        operation.type === 'addLayer' &&
          operation.layer.type === 'shape' &&
          operation.layer.fill,
      ).toEqual({ type: 'solid', color: 'transparent' });
    }
  });
});

describe('mcp executor', () => {
  it('applies a batch as one undoable step and selects added layers', () => {
    const project = openProject();
    const result = executeApplyOperations({
      operations: [
        { type: 'addLayer', layer: textLayer('layer_headline') },
        { type: 'addLayer', layer: shapeLayer('layer_badge') },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.changedLayerIds).toEqual(['layer_headline', 'layer_badge']);
    expect(result.idMap).toEqual({});
    let current = currentProject(project.id);
    expect(current.artboards[0].layers).toHaveLength(2);
    expect(selectionStore.getState().selectedLayerIds).toEqual([
      'layer_headline',
      'layer_badge',
    ]);

    undoProject(project.id);
    current = currentProject(project.id);
    expect(current.artboards[0].layers).toHaveLength(0);
  });

  it('mints replacement ids on collision and remaps later references', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [{ type: 'addLayer', layer: textLayer('layer_taken') }],
    });
    const result = executeApplyOperations({
      operations: [
        { type: 'addLayer', layer: shapeLayer('layer_taken') },
        { type: 'updateLayer', layerId: 'layer_taken', patch: { x: 500 } },
      ],
    });
    const minted = result.idMap.layer_taken;
    expect(minted).toBeTruthy();
    expect(minted).not.toBe('layer_taken');

    const layers = currentProject(project.id).artboards[0].layers;
    expect(layers).toHaveLength(2);
    const mintedLayer = layers.find((layer) => layer.id === minted);
    // The in-batch update targeted the re-minted layer, not the original.
    expect(mintedLayer?.x).toBe(500);
    expect(layers.find((layer) => layer.id === 'layer_taken')?.x).toBe(40);
  });

  it('updates a layer added earlier in the same batch', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'addLayer', layer: textLayer('layer_a') },
        {
          type: 'updateLayer',
          layerId: 'layer_a',
          patch: { text: { en: 'Updated' } },
        },
      ],
    });
    const layer = currentProject(project.id).artboards[0].layers[0];
    expect(layer.type === 'text' && layer.text.en).toBe('Updated');
  });

  it('keeps batches atomic: a failing operation applies nothing', () => {
    const project = openProject();
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            { type: 'addLayer', layer: textLayer('layer_ok') },
            { type: 'deleteLayers', layerIds: ['layer_missing'] },
          ],
        }),
      'LAYER_NOT_FOUND',
    );
    expect(currentProject(project.id).artboards[0].layers).toHaveLength(0);
  });

  it('rejects stale baseRevision values', () => {
    const project = openProject();
    const staleRevision = projectRevision(currentProject(project.id));
    vi.setSystemTime(Date.now() + 5_000);
    executeApplyOperations({
      operations: [{ type: 'addLayer', layer: textLayer('layer_first') }],
    });
    const error = expectMcpError(
      () =>
        executeApplyOperations({
          baseRevision: staleRevision,
          operations: [{ type: 'addLayer', layer: textLayer('layer_second') }],
        }),
      'REVISION_MISMATCH',
    );
    expect(error.payload.recoverable).toBe(true);
    expect(currentProject(project.id).artboards[0].layers).toHaveLength(1);
  });

  it('groups and ungroups top-level layers', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'addLayer', layer: textLayer('layer_a') },
        { type: 'addLayer', layer: shapeLayer('layer_b') },
        {
          type: 'groupLayers',
          layerIds: ['layer_a', 'layer_b'],
          name: 'Header',
        },
      ],
    });
    let layers = currentProject(project.id).artboards[0].layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe('group');
    expect(layers[0].name).toBe('Header');

    executeApplyOperations({
      operations: [{ type: 'ungroupLayer', layerId: layers[0].id }],
    });
    layers = currentProject(project.id).artboards[0].layers;
    expect(layers.map((layer) => layer.id)).toEqual(['layer_a', 'layer_b']);
  });

  it('adds artboards and focuses them via setActiveArtboard', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'addArtboard', preset: 'story', name: 'Story variant' },
      ],
    });
    const current = currentProject(project.id);
    expect(current.artboards).toHaveLength(2);
    const added = current.artboards[1];
    expect(added.preset).toBe('story');

    executeApplyOperations({
      operations: [{ type: 'setActiveArtboard', artboardId: added.id }],
    });
    expect(selectionStore.getState().activeArtboardId).toBe(added.id);
  });

  it('enforces the per-artboard layer cap', () => {
    const project = openProject();
    projectStore.getState().patchProject(project.id, (draft) => {
      for (let i = 0; i < MAX_LAYERS_PER_ARTBOARD; i += 1) {
        draft.artboards[0].layers.push({
          id: `layer_bulk_${i}`,
          name: `Bulk ${i}`,
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
          fill: { type: 'solid', color: '#FFFFFF' },
        });
      }
    });
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            { type: 'addLayer', layer: textLayer('layer_overflowing') },
          ],
        }),
      'VALIDATION_FAILED',
    );
  });

  it('rejects oversized batch payloads', () => {
    openProject();
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            {
              type: 'addLayer',
              layer: textLayer('layer_huge', {
                text: { en: 'x'.repeat(600_000) },
              }),
            },
          ],
        }),
      'VALIDATION_FAILED',
    );
  });

  it('warns when a layer lands fully outside the artboard', () => {
    openProject();
    const result = executeApplyOperations({
      operations: [
        {
          type: 'addLayer',
          layer: textLayer('layer_lost', { x: 5000, y: 5000 }),
        },
      ],
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('layer_lost');
  });

  it('warns when text clips inside its layer box', () => {
    openProject();
    const result = executeApplyOperations({
      operations: [
        {
          type: 'addLayer',
          layer: textLayer('layer_clipped', {
            w: 120,
            h: 24,
            text: { en: 'THIS HEADLINE CANNOT FIT' },
            style: { fontSize: 96, lineHeight: 1 },
          }),
        },
      ],
    });
    expect(
      result.warnings.some((warning) => warning.includes('layer_clipped')),
    ).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes('overflows')),
    ).toBe(true);
  });

  it('fails with PROJECT_NOT_FOUND when nothing is open', () => {
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [{ type: 'addLayer', layer: textLayer('layer_orphan') }],
        }),
      'PROJECT_NOT_FOUND',
    );
  });

  it('fails with ARTBOARD_NOT_FOUND for an unknown target artboard', () => {
    openProject();
    expectMcpError(
      () =>
        executeApplyOperations({
          artboardId: 'ab_ghost',
          operations: [{ type: 'addLayer', layer: textLayer('layer_a') }],
        }),
      'ARTBOARD_NOT_FOUND',
    );
  });

  it('rejects reordering a layer that is not top-level', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'addLayer', layer: textLayer('layer_a') },
        { type: 'addLayer', layer: shapeLayer('layer_b') },
        { type: 'groupLayers', layerIds: ['layer_a', 'layer_b'] },
      ],
    });
    expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            { type: 'reorderLayer', layerId: 'layer_a', toIndex: 0 },
          ],
        }),
      'LAYER_NOT_FOUND',
    );
    expect(currentProject(project.id).artboards[0].layers).toHaveLength(1);
  });

  it('rejects garbage envelopes cleanly', () => {
    openProject();
    for (const junk of [
      null,
      42,
      'operations',
      { operations: [] },
      { operations: 'all' },
    ]) {
      expectMcpError(() => executeApplyOperations(junk), 'VALIDATION_FAILED');
    }
  });

  it('returns leaf JSON paths for malformed layer fields', () => {
    openProject();
    const error = expectMcpError(
      () =>
        executeApplyOperations({
          operations: [
            {
              type: 'addLayer',
              layer: shapeLayer('layer_bad_stroke', {
                stroke: { color: '#FFFFFF', width: 'wide' },
              }),
            },
          ],
        }),
      'VALIDATION_FAILED',
    );
    expect(error.payload.message).toContain('operations[0].layer.stroke.width');
    expect(error.payload.details).toMatchObject({
      issues: [
        expect.objectContaining({
          path: 'operations[0].layer.stroke.width',
          code: 'invalid_type',
        }),
      ],
    });
  });

  it('ignores type-incompatible patch fields instead of corrupting layers', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [
        { type: 'addLayer', layer: textLayer('layer_text') },
        {
          type: 'updateLayer',
          layerId: 'layer_text',
          // `fill` only applies to shape layers; a text layer must ignore it.
          patch: { fill: { type: 'solid', color: '#FF0000' }, x: 90 },
        },
      ],
    });
    const layer = currentProject(project.id).artboards[0].layers[0];
    expect(layer.x).toBe(90);
    expect('fill' in layer).toBe(false);
  });
});

describe('mcp validate_operations', () => {
  it('reports validity without mutating the project', () => {
    const project = openProject();
    const result = executeValidateOperations({
      operations: [{ type: 'addLayer', layer: textLayer('layer_dry') }],
    });
    expect(result.valid).toBe(true);
    expect(currentProject(project.id).artboards[0].layers).toHaveLength(0);
  });

  it('returns structured errors instead of throwing', () => {
    openProject();
    const result = executeValidateOperations({
      operations: [{ type: 'deleteLayers', layerIds: ['layer_ghost'] }],
    });
    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe('LAYER_NOT_FOUND');
  });
});

describe('mcp permissions', () => {
  it('denies writes in read-only mode', async () => {
    mcpStore.setState({
      settings: { ...DEFAULT_MCP_SETTINGS, permissionMode: 'read' },
    });
    await expect(
      ensureWritePermission({ name: 'Test agent' }),
    ).rejects.toMatchObject({
      payload: { code: 'PERMISSION_DENIED' },
    });
  });

  it('grants the session after one approval', async () => {
    mcpStore.setState({
      settings: { ...DEFAULT_MCP_SETTINGS, permissionMode: 'session' },
    });
    const first = ensureWritePermission({ name: 'Claude Code' });
    // The in-app confirm dialog is now open; accept it.
    await vi.waitFor(() => {
      expect(confirmStore.getState().request).not.toBeNull();
    });
    confirmStore.getState().respond(true);
    await expect(first).resolves.toBeUndefined();
    expect(mcpStore.getState().sessionWriteGranted).toBe(true);
    // Second write sails through without a prompt.
    await expect(
      ensureWritePermission({ name: 'Claude Code' }),
    ).resolves.toBeUndefined();
    expect(confirmStore.getState().request).toBeNull();
  });

  it('propagates a decline as PERMISSION_DENIED and keeps the session revoked', async () => {
    mcpStore.setState({
      settings: { ...DEFAULT_MCP_SETTINGS, permissionMode: 'session' },
    });
    const attempt = ensureWritePermission({ name: 'Claude Code' });
    await vi.waitFor(() => {
      expect(confirmStore.getState().request).not.toBeNull();
    });
    confirmStore.getState().respond(false);
    await expect(attempt).rejects.toMatchObject({
      payload: { code: 'PERMISSION_DENIED' },
    });
    expect(mcpStore.getState().sessionWriteGranted).toBe(false);
  });
});

describe('mcp context serializers', () => {
  it('summarizes the active project without asset payloads or secrets', () => {
    const project = openProject();
    executeApplyOperations({
      operations: [{ type: 'addLayer', layer: textLayer('layer_head') }],
    });
    const summary = serializeProjectSummary(currentProject(project.id));
    expect(summary.artboards[0].layers[0]).toMatchObject({
      id: 'layer_head',
      type: 'text',
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('data:');

    const status = serializeAppStatus();
    expect(status.activeProject?.id).toBe(project.id);
    expect(status.writeAccess).toBe('requires-approval');
  });
});
