import { z } from 'zod';
import {
  ARTBOARD_PRESETS,
  layerSchema,
  listItemSchema,
  listMarkerSchema,
  localeCodeSchema,
  textStyleSchema,
  fillSchema,
  strokeSchema,
  layerEffectsSchema,
  stickerOutlineSchema,
  type ArtboardPresetId,
} from '@/lib/schema';

/** Contract between MCP agents and the in-app executor: a batch of
 * command-level operations, never arbitrary project JSON. Mirrors the manual
 * command surface in `projectCommands.ts` so agent edits stay inside the same
 * invariants (undo, autosave, selection) as user edits. */

/** Max operations per `apply_operations` batch. */
export const MAX_OPERATIONS_PER_BATCH = 50;
/** Max layers an agent may leave on one artboard (mirrors the AI template cap
 * spirit, scaled up because agents also edit existing designs). */
export const MAX_LAYERS_PER_ARTBOARD = 100;
/** Max serialized batch payload accepted by the executor, in bytes. */
export const MAX_BATCH_BYTES = 512 * 1024;

const presetIdSchema = z.enum(
  Object.keys(ARTBOARD_PRESETS) as [ArtboardPresetId, ...ArtboardPresetId[]],
);

/** Field patch for `updateLayer`. Strict so typos fail loudly instead of being
 * silently dropped — agents recover better from a clear validation error. The
 * shape mirrors `LayerPatch` in `src/editor/utils/layers.ts`; type-incompatible
 * fields are ignored by `applyLayerPatch` at apply time. */
export const layerPatchSchema = z
  .object({
    name: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
    visible: z.boolean(),
    locked: z.boolean(),
    blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay']),
    effects: layerEffectsSchema.nullable(),
    sticker: stickerOutlineSchema.nullable(),
    // Text / list typography.
    text: z.record(localeCodeSchema, z.string()),
    style: textStyleSchema.partial(),
    // Shape fields.
    fill: fillSchema,
    stroke: strokeSchema,
    cornerRadius: z.number().nonnegative(),
    points: z.array(z.number()).nullable(),
    pointWidths: z.array(z.number().nonnegative()).nullable(),
    tension: z.number(),
    // Image / SVG fields.
    fit: z.enum(['cover', 'contain', 'stretch']),
    color: z.string().nullable(),
    // List fields.
    items: z.array(listItemSchema).min(1),
    marker: listMarkerSchema.partial(),
    markerGap: z.number(),
  })
  .partial()
  .strict();

export const addLayerOperationSchema = z
  .object({
    type: z.literal('addLayer'),
    /** Full layer document; agent-provided ids are honoured when unused,
     * otherwise Calqo mints replacements and returns them in `idMap`. */
    layer: layerSchema,
    /** Insertion index in the artboard's top-level z-order (append if omitted). */
    index: z.number().int().nonnegative().optional(),
  })
  .strict();

export const updateLayerOperationSchema = z
  .object({
    type: z.literal('updateLayer'),
    layerId: z.string().min(1),
    patch: layerPatchSchema,
  })
  .strict();

export const deleteLayersOperationSchema = z
  .object({
    type: z.literal('deleteLayers'),
    layerIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const reorderLayerOperationSchema = z
  .object({
    type: z.literal('reorderLayer'),
    layerId: z.string().min(1),
    /** Target index among the artboard's top-level layers. */
    toIndex: z.number().int().nonnegative(),
  })
  .strict();

export const groupLayersOperationSchema = z
  .object({
    type: z.literal('groupLayers'),
    layerIds: z.array(z.string().min(1)).min(2),
    name: z.string().min(1).optional(),
  })
  .strict();

export const ungroupLayerOperationSchema = z
  .object({
    type: z.literal('ungroupLayer'),
    layerId: z.string().min(1),
  })
  .strict();

export const addArtboardOperationSchema = z
  .object({
    type: z.literal('addArtboard'),
    preset: presetIdSchema,
    name: z.string().min(1).optional(),
  })
  .strict();

export const setActiveArtboardOperationSchema = z
  .object({
    type: z.literal('setActiveArtboard'),
    artboardId: z.string().min(1),
  })
  .strict();

export const mcpOperationSchema = z.discriminatedUnion('type', [
  addLayerOperationSchema,
  updateLayerOperationSchema,
  deleteLayersOperationSchema,
  reorderLayerOperationSchema,
  groupLayersOperationSchema,
  ungroupLayerOperationSchema,
  addArtboardOperationSchema,
  setActiveArtboardOperationSchema,
]);

export const applyOperationsInputSchema = z
  .object({
    /** Defaults to the active project. */
    projectId: z.string().min(1).optional(),
    /** Defaults to the active artboard. */
    artboardId: z.string().min(1).optional(),
    /** The `revision` the agent last read; rejected when stale. */
    baseRevision: z.string().min(1).optional(),
    operations: z.array(mcpOperationSchema).min(1).max(MAX_OPERATIONS_PER_BATCH),
  })
  .strict();

export const createProjectInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    preset: presetIdSchema.optional(),
    locale: localeCodeSchema.optional(),
  })
  .strict();

export const getPreviewInputSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    artboardId: z.string().min(1).optional(),
  })
  .strict();

export type McpOperation = z.infer<typeof mcpOperationSchema>;
export type ApplyOperationsInput = z.infer<typeof applyOperationsInputSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type GetPreviewInput = z.infer<typeof getPreviewInputSchema>;

/** Structured error codes agents can branch on (plan §3.3). */
export type McpErrorCode =
  | 'PERMISSION_DENIED'
  | 'PROJECT_NOT_FOUND'
  | 'ARTBOARD_NOT_FOUND'
  | 'LAYER_NOT_FOUND'
  | 'REVISION_MISMATCH'
  | 'VALIDATION_FAILED'
  | 'UNSUPPORTED_OPERATION'
  | 'EXPORT_FAILED'
  | 'APP_NOT_READY'
  | 'INTERNAL_ERROR';

export interface McpErrorPayload {
  code: McpErrorCode;
  message: string;
  /** Whether the agent can plausibly fix the call and retry. */
  recoverable: boolean;
  details?: unknown;
}

export class McpOperationError extends Error {
  readonly payload: McpErrorPayload;

  constructor(payload: McpErrorPayload) {
    super(payload.message);
    this.name = 'McpOperationError';
    this.payload = payload;
  }
}

export interface ApplyOperationsResult {
  ok: true;
  projectId: string;
  artboardId: string;
  /** New revision after the batch (the project's `updatedAt`). */
  revision: string;
  changedLayerIds: string[];
  /** Agent-supplied id → id Calqo actually minted (collisions only). */
  idMap: Record<string, string>;
  warnings: string[];
}
