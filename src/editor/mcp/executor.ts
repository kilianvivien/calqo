import type { Draft } from 'immer';
import {
  createArtboard,
  type CalqoArtboard,
  type CalqoLayer,
  type CalqoProject,
  type GroupLayer,
} from '@/lib/schema';
import {
  applyLayerPatch,
  boundingBox,
  flattenLayers,
  isGroupLayer,
  moveInArray,
  removeLayer,
  updateLayer,
  type LayerPatch,
} from '@/editor/utils/layers';
import {
  applyAddContentLocale,
  applySetActiveContentLocale,
  editProject,
} from '@/editor/commands/projectCommands';
import {
  detectListOverflow,
  detectTextOverflow,
} from '@/editor/i18n-content/translationPipeline';
import { createId } from '@/lib/utils/ids';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import {
  applyOperationsInputSchema,
  MAX_BATCH_BYTES,
  MAX_LAYERS_PER_ARTBOARD,
  McpOperationError,
  type ApplyOperationsInput,
  type ApplyOperationsResult,
  type McpErrorCode,
  type McpOperation,
} from './operationSchemas';

/** Executes validated MCP operation batches through the normal command path:
 * every batch is simulated on a clone first (atomicity), then committed as one
 * undoable `editProject` recipe so agent edits behave like user edits. */

function fail(
  code: McpErrorCode,
  message: string,
  recoverable = true,
  details?: unknown,
): never {
  throw new McpOperationError({ code, message, recoverable, details });
}

/** The project's `updatedAt` doubles as the optimistic-concurrency revision:
 * every mutation restamps it, so an agent holding an old value is stale. */
export function projectRevision(project: CalqoProject): string {
  return project.updatedAt;
}

export function resolveMcpProject(projectId?: string): CalqoProject {
  const id =
    projectId ?? workspaceStore.getState().activeProjectId ?? undefined;
  if (!id) {
    fail(
      'PROJECT_NOT_FOUND',
      'No project is open. Call calqo_create_project first.',
    );
  }
  const project = projectStore.getState().projects[id];
  if (!project) {
    fail('PROJECT_NOT_FOUND', `Project "${id}" is not open in Calqo.`, true, {
      openProjectIds: Object.keys(projectStore.getState().projects),
    });
  }
  return project;
}

export function resolveMcpArtboard(
  project: CalqoProject,
  artboardId?: string,
): CalqoArtboard {
  const id =
    artboardId ??
    (workspaceStore.getState().activeProjectId === project.id
      ? (selectionStore.getState().activeArtboardId ?? undefined)
      : undefined) ??
    project.artboards[0]?.id;
  const artboard = project.artboards.find((candidate) => candidate.id === id);
  if (!artboard) {
    fail(
      'ARTBOARD_NOT_FOUND',
      `Artboard "${id}" does not exist in this project.`,
      true,
      {
        artboardIds: project.artboards.map((candidate) => candidate.id),
      },
    );
  }
  return artboard;
}

/** Every id already used anywhere in the project (layers, list rows, artboards). */
function collectUsedIds(project: CalqoProject): Set<string> {
  const used = new Set<string>();
  for (const artboard of project.artboards) {
    used.add(artboard.id);
    for (const layer of flattenLayers(artboard.layers)) {
      used.add(layer.id);
      if (layer.type === 'list')
        layer.items.forEach((item) => used.add(item.id));
    }
  }
  return used;
}

/** Honour agent-provided ids when they are free; mint replacements on
 * collision (recorded in `idMap` so the agent can keep referencing its own
 * handles). Mutates the (already cloned) layer tree in place. */
function reassignCollidingIds(
  layer: CalqoLayer,
  used: Set<string>,
  idMap: Record<string, string>,
): void {
  const claim = (id: string, prefix: string): string => {
    if (id && !used.has(id)) {
      used.add(id);
      return id;
    }
    const minted = createId(prefix);
    used.add(minted);
    if (id) idMap[id] = minted;
    return minted;
  };
  layer.id = claim(layer.id, 'layer');
  if (layer.type === 'list') {
    layer.items.forEach((item) => {
      item.id = claim(item.id, 'item');
    });
  }
  if (isGroupLayer(layer)) {
    layer.children.forEach((child) => reassignCollidingIds(child, used, idMap));
  }
}

interface NormalizedBatch {
  operations: McpOperation[];
  idMap: Record<string, string>;
  /** Pre-minted artboard ids for addArtboard ops, in op order. */
  artboardIds: string[];
}

/** Resolve final ids for everything the batch creates, before any apply, so
 * the simulate and commit passes produce identical documents. */
function normalizeBatch(
  project: CalqoProject,
  operations: McpOperation[],
): NormalizedBatch {
  const used = collectUsedIds(project);
  const idMap: Record<string, string> = {};
  const artboardIds: string[] = [];
  const normalized = operations.map((operation) => {
    if (operation.type === 'addLayer') {
      const layer = structuredClone(operation.layer);
      reassignCollidingIds(layer, used, idMap);
      return { ...operation, layer };
    }
    if (operation.type === 'addArtboard') {
      const id = createId('ab');
      used.add(id);
      artboardIds.push(id);
    }
    return operation;
  });
  return { operations: normalized, idMap, artboardIds };
}

/** Remap operation references through the collision id map so an agent batch
 * that adds a layer and immediately updates it keeps working after re-minting. */
function mappedId(id: string, idMap: Record<string, string>): string {
  return idMap[id] ?? id;
}

interface ApplyOutcome {
  changedLayerIds: string[];
  addedTopLevelIds: string[];
  warnings: string[];
  /** Artboard to focus after commit (setActiveArtboard op). */
  focusArtboardId: string | null;
}

function countLayers(layers: CalqoLayer[]): number {
  return flattenLayers(layers).length;
}

function warnIfOutOfBounds(
  layer: CalqoLayer,
  artboard: CalqoArtboard | Draft<CalqoArtboard>,
  warnings: string[],
): void {
  if (
    layer.x + layer.w < 0 ||
    layer.y + layer.h < 0 ||
    layer.x > artboard.width ||
    layer.y > artboard.height
  ) {
    warnings.push(
      `Layer "${layer.name}" (${layer.id}) is entirely outside artboard bounds ` +
        `${artboard.width}x${artboard.height}.`,
    );
  }
}

function warnIfTextOverflows(
  layer: CalqoLayer,
  activeLocale: string,
  warnings: string[],
): void {
  const overflow =
    layer.type === 'text'
      ? detectTextOverflow(layer, activeLocale)
      : layer.type === 'list'
        ? detectListOverflow(layer, activeLocale)
        : undefined;
  if (!overflow?.hasOverflow) return;
  warnings.push(
    `Text in layer "${layer.name}" (${layer.id}) overflows its ${layer.w}x${layer.h} box ` +
      `for locale "${activeLocale}"; ${overflow.suggestedAction === 'reduce-font' ? 'reduce the font size or enlarge the box' : 'enlarge the box or shorten the copy'}.`,
  );
}

/** Apply a normalized batch to a project document (clone during simulation,
 * immer draft during commit). Throws `McpOperationError` on the first invalid
 * operation — callers rely on the simulate pass to keep commits atomic. */
export function applyBatchToProject(
  project: CalqoProject | Draft<CalqoProject>,
  artboardId: string,
  batch: NormalizedBatch,
): ApplyOutcome {
  const outcome: ApplyOutcome = {
    changedLayerIds: [],
    addedTopLevelIds: [],
    warnings: [],
    focusArtboardId: null,
  };
  const artboard = project.artboards.find(
    (candidate) => candidate.id === artboardId,
  );
  if (!artboard) {
    fail('ARTBOARD_NOT_FOUND', `Artboard "${artboardId}" does not exist.`);
  }
  const layers = () => artboard.layers as CalqoLayer[];
  let artboardCursor = 0;

  for (const [index, operation] of batch.operations.entries()) {
    // Explicit annotation so TS narrows on the never-returning call.
    const opFail: (
      code: McpErrorCode,
      message: string,
      details?: unknown,
    ) => never = (code, message, details) =>
      fail(
        code,
        `operations[${index}] (${operation.type}): ${message}`,
        true,
        details,
      );

    switch (operation.type) {
      case 'addLayer': {
        if (
          countLayers(layers()) + countLayers([operation.layer]) >
          MAX_LAYERS_PER_ARTBOARD
        ) {
          opFail(
            'VALIDATION_FAILED',
            `Adding this layer would exceed the ${MAX_LAYERS_PER_ARTBOARD}-layer cap per artboard. Delete or group layers first.`,
          );
        }
        const layer = structuredClone(operation.layer);
        const insertAt = Math.min(
          operation.index ?? layers().length,
          layers().length,
        );
        layers().splice(insertAt, 0, layer);
        warnIfOutOfBounds(layer, artboard, outcome.warnings);
        warnIfTextOverflows(
          layer,
          project.activeContentLocale,
          outcome.warnings,
        );
        outcome.changedLayerIds.push(layer.id);
        outcome.addedTopLevelIds.push(layer.id);
        break;
      }
      case 'updateLayer': {
        const layerId = mappedId(operation.layerId, batch.idMap);
        const updated = updateLayer(layers(), layerId, (layer) => {
          applyLayerPatch(layer, operation.patch as LayerPatch);
          warnIfOutOfBounds(layer, artboard, outcome.warnings);
          warnIfTextOverflows(
            layer,
            project.activeContentLocale,
            outcome.warnings,
          );
        });
        if (!updated)
          opFail(
            'LAYER_NOT_FOUND',
            `Layer "${layerId}" not found on this artboard.`,
          );
        outcome.changedLayerIds.push(layerId);
        break;
      }
      case 'deleteLayers': {
        for (const rawId of operation.layerIds) {
          const layerId = mappedId(rawId, batch.idMap);
          const removed = removeLayer(layers(), layerId);
          if (!removed)
            opFail(
              'LAYER_NOT_FOUND',
              `Layer "${layerId}" not found on this artboard.`,
            );
          outcome.changedLayerIds.push(layerId);
        }
        break;
      }
      case 'reorderLayer': {
        const layerId = mappedId(operation.layerId, batch.idMap);
        const from = layers().findIndex((layer) => layer.id === layerId);
        if (from < 0) {
          opFail(
            'LAYER_NOT_FOUND',
            `Layer "${layerId}" is not a top-level layer of this artboard.`,
          );
        }
        const to = Math.min(operation.toIndex, layers().length - 1);
        artboard.layers = moveInArray(layers(), from, to);
        outcome.changedLayerIds.push(layerId);
        break;
      }
      case 'groupLayers': {
        const ids = operation.layerIds.map((id) => mappedId(id, batch.idMap));
        const ordered = layers().filter((layer) => ids.includes(layer.id));
        if (ordered.length !== ids.length) {
          const found = new Set(ordered.map((layer) => layer.id));
          opFail(
            'LAYER_NOT_FOUND',
            `Layers must be top-level on this artboard.`,
            {
              missing: ids.filter((id) => !found.has(id)),
            },
          );
        }
        const box = boundingBox(ordered);
        const topIndex = Math.max(
          ...ordered.map((layer) =>
            layers().findIndex((candidate) => candidate.id === layer.id),
          ),
        );
        const children = ordered
          .map((layer) => {
            const removed = removeLayer(layers(), layer.id);
            if (removed) {
              removed.x -= box.x;
              removed.y -= box.y;
            }
            return removed;
          })
          .filter((layer): layer is CalqoLayer => Boolean(layer));
        const group: GroupLayer = {
          id: createId('layer'),
          name: operation.name ?? 'Group',
          type: 'group',
          x: box.x,
          y: box.y,
          w: Math.max(1, box.w),
          h: Math.max(1, box.h),
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          expanded: true,
          children,
        };
        const insertAt = Math.min(
          topIndex - children.length + 1,
          layers().length,
        );
        layers().splice(Math.max(0, insertAt), 0, group);
        outcome.changedLayerIds.push(group.id);
        outcome.addedTopLevelIds.push(group.id);
        break;
      }
      case 'ungroupLayer': {
        const layerId = mappedId(operation.layerId, batch.idMap);
        const index = layers().findIndex((layer) => layer.id === layerId);
        const group = index >= 0 ? layers()[index] : null;
        if (!group || !isGroupLayer(group)) {
          opFail(
            'LAYER_NOT_FOUND',
            `Layer "${layerId}" is not a top-level group.`,
          );
        }
        const children = group.children.map((child) => {
          child.x += group.x;
          child.y += group.y;
          outcome.changedLayerIds.push(child.id);
          return child;
        });
        layers().splice(index, 1, ...children);
        break;
      }
      case 'addArtboard': {
        const created = createArtboard(operation.preset, operation.name);
        created.id = batch.artboardIds[artboardCursor++] ?? created.id;
        project.artboards.push(created);
        break;
      }
      case 'setActiveArtboard': {
        const exists = project.artboards.some(
          (candidate) => candidate.id === operation.artboardId,
        );
        if (!exists) {
          opFail(
            'ARTBOARD_NOT_FOUND',
            `Artboard "${operation.artboardId}" does not exist.`,
          );
        }
        outcome.focusArtboardId = operation.artboardId;
        break;
      }
      case 'addContentLocale': {
        applyAddContentLocale(project, operation.locale, {
          copyFrom: operation.copyFrom,
        });
        break;
      }
      case 'setActiveContentLocale': {
        if (!project.contentLocales.includes(operation.locale)) {
          opFail(
            'VALIDATION_FAILED',
            `Content locale "${operation.locale}" is not registered. Add it with addContentLocale first.`,
            { contentLocales: project.contentLocales },
          );
        }
        applySetActiveContentLocale(project, operation.locale);
        break;
      }
    }
  }
  return outcome;
}

interface ValidationIssueDetail {
  path: string;
  message: string;
  code: string;
}

function issuePath(path: PropertyKey[]): string {
  if (path.length === 0) return '(root)';
  return path
    .map((part, index) =>
      typeof part === 'number'
        ? `[${part}]`
        : `${index === 0 ? '' : '.'}${String(part)}`,
    )
    .join('');
}

/** Zod's union error normally collapses to `layer: Invalid input`. Select the
 * closest union branch and expose its leaf paths so an agent sees e.g.
 * `operations[2].layer.stroke.width` without probe/bisect calls. */
function detailedValidationIssues(
  issues: Array<Record<string, unknown>>,
): ValidationIssueDetail[] {
  const flattened = issues.flatMap((issue) => {
    if (issue.code === 'invalid_union' && Array.isArray(issue.unionErrors)) {
      const candidates = issue.unionErrors
        .map((error) => {
          const nested =
            error &&
            typeof error === 'object' &&
            Array.isArray((error as { issues?: unknown }).issues)
              ? (error as { issues: Array<Record<string, unknown>> }).issues
              : [];
          return detailedValidationIssues(nested);
        })
        .filter((candidate) => candidate.length > 0)
        .sort((a, b) => a.length - b.length);
      if (candidates[0]) return candidates[0];
    }
    const path = Array.isArray(issue.path) ? (issue.path as PropertyKey[]) : [];
    return [
      {
        path: issuePath(path),
        message:
          typeof issue.message === 'string' ? issue.message : 'Invalid input',
        code: typeof issue.code === 'string' ? issue.code : 'custom',
      },
    ];
  });
  return flattened.filter(
    (issue, index) =>
      flattened.findIndex(
        (candidate) =>
          candidate.path === issue.path && candidate.message === issue.message,
      ) === index,
  );
}

function parseInput(raw: unknown): ApplyOperationsInput {
  let size: number;
  try {
    size = JSON.stringify(raw)?.length ?? 0;
  } catch {
    fail('VALIDATION_FAILED', 'Input is not serializable JSON.');
  }
  if (size > MAX_BATCH_BYTES) {
    fail(
      'VALIDATION_FAILED',
      `Batch payload is ${size} bytes; the cap is ${MAX_BATCH_BYTES}. Split the work into smaller batches.`,
    );
  }
  const parsed = applyOperationsInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = detailedValidationIssues(
      parsed.error.issues as unknown as Array<Record<string, unknown>>,
    );
    const first = issues[0];
    fail(
      'VALIDATION_FAILED',
      first
        ? `Operation batch failed validation at ${first.path}: ${first.message}`
        : 'Operation batch failed validation.',
      true,
      { issues },
    );
  }
  return parsed.data;
}

interface PreparedBatch {
  project: CalqoProject;
  artboard: CalqoArtboard;
  batch: NormalizedBatch;
  /** Outcome of the simulation pass (same ops, cloned project). */
  simulated: ApplyOutcome;
}

/** Validate + simulate a batch without touching live state. */
export function prepareApplyOperations(raw: unknown): PreparedBatch {
  const input = parseInput(raw);
  const project = resolveMcpProject(input.projectId);
  const artboard = resolveMcpArtboard(project, input.artboardId);
  if (input.baseRevision && input.baseRevision !== projectRevision(project)) {
    fail(
      'REVISION_MISMATCH',
      'The project changed since the agent last read it.',
      true,
      {
        expected: input.baseRevision,
        actual: projectRevision(project),
      },
    );
  }
  const batch = normalizeBatch(project, input.operations);
  const simulated = applyBatchToProject(
    structuredClone(project),
    artboard.id,
    batch,
  );
  return { project, artboard, batch, simulated };
}

/** Validate, simulate, then commit a batch as one undoable step. */
export function executeApplyOperations(raw: unknown): ApplyOperationsResult {
  const { project, artboard, batch, simulated } = prepareApplyOperations(raw);

  editProject(
    project.id,
    (draft) => {
      applyBatchToProject(draft, artboard.id, batch);
    },
    { undoable: true },
  );

  if (
    simulated.focusArtboardId &&
    workspaceStore.getState().activeProjectId === project.id
  ) {
    selectionStore.getState().setActiveArtboard(simulated.focusArtboardId);
    selectionStore.getState().clearSelection();
  } else if (
    simulated.addedTopLevelIds.length > 0 &&
    workspaceStore.getState().activeProjectId === project.id &&
    selectionStore.getState().activeArtboardId === artboard.id
  ) {
    // Select what the agent just added so the change is visible on canvas.
    selectionStore.getState().setSelection(simulated.addedTopLevelIds);
  }

  const committed = projectStore.getState().projects[project.id];
  return {
    ok: true,
    projectId: project.id,
    artboardId: artboard.id,
    revision: committed ? projectRevision(committed) : projectRevision(project),
    changedLayerIds: [...new Set(simulated.changedLayerIds)],
    idMap: batch.idMap,
    warnings: simulated.warnings,
  };
}

/** Dry-run a batch: returns validity + warnings instead of mutating anything.
 * Validation failures come back as a structured result (not a thrown error) so
 * agents can inspect them cheaply. */
export function executeValidateOperations(raw: unknown): {
  ok: true;
  valid: boolean;
  warnings: string[];
  idMap: Record<string, string>;
  error?: McpOperationError['payload'];
} {
  try {
    const { batch, simulated } = prepareApplyOperations(raw);
    return {
      ok: true,
      valid: true,
      warnings: simulated.warnings,
      idMap: batch.idMap,
    };
  } catch (error) {
    if (error instanceof McpOperationError) {
      return {
        ok: true,
        valid: false,
        warnings: [],
        idMap: {},
        error: error.payload,
      };
    }
    throw error;
  }
}
