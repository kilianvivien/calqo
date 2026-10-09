import { BUNDLED_FONTS } from '@/lib/adapters/fonts/browserFontAdapter';
import type { CalqoArtboard, CalqoLayer, CalqoProject } from '@/lib/schema';
import { resolveLocaleValue } from '@/editor/i18n-content/translationPipeline';
import { executeApplyOperations, projectRevision } from '@/editor/mcp/executor';
import { McpOperationError } from '@/editor/mcp/operationSchemas';
import { flattenLayers, isGroupLayer } from '@/editor/utils/layers';
import { createId } from '@/lib/utils/ids';
import type { AIProvider, AIProviderDiagnostics } from './AIProvider';
import type { CompletionImage, CompletionProgress } from './completion';
import { buildDesignEditPrompt } from './prompts';
import {
  ensureLayerIds,
  normalizeAiFill,
  normalizeLayer,
  repairJsonLikeResponse,
} from './validation';

/** Prompt-to-edit: the model proposes a batch of the same command-level
 * operations MCP agents use, and the MCP executor validates, simulates and
 * commits it as one undo step. The in-app assistant is deliberately limited to
 * static layout operations; motion and multi-artboard edits stay manual. */
export const DESIGN_EDIT_OPERATIONS = [
  'updateLayer',
  'addLayer',
  'deleteLayers',
  'reorderLayer',
  'groupLayers',
  'ungroupLayer',
  'setArtboardBackground',
] as const;

export const MAX_DESIGN_EDIT_OPERATIONS = 40;
/** Above this many characters the artboard is described without per-layer
 * styling so the request stays inside modest context windows. */
const MAX_ARTBOARD_JSON_CHARS = 60_000;

const TEXT_STYLE_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'color',
  'align',
  'verticalAlign',
  'lineHeight',
  'letterSpacing',
]);

export interface DesignEditRequest {
  instruction: string;
  projectId: string;
  artboardId: string;
  selectedLayerIds: string[];
  /** Optional rendering of the artboard for vision-capable providers. */
  preview?: CompletionImage;
}

export type DesignEditOutcome =
  | {
      ok: true;
      summary: string;
      /** False when the model answered without proposing any change. */
      changed: boolean;
      changedLayerIds: string[];
      warnings: string[];
      diagnostics: AIProviderDiagnostics;
    }
  | {
      ok: false;
      /** `stale`: the design changed while the model was working. */
      reason: 'invalid' | 'stale' | 'unsupported';
      error: string;
      issues?: string[];
      raw?: string;
      diagnostics?: AIProviderDiagnostics;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Describe a layer in the model-facing shorthand: plain-string copy for the
 * active locale, no asset payloads, no animation. */
function describeLayer(
  layer: CalqoLayer,
  locale: string,
  detailed: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    w: Math.round(layer.w),
    h: Math.round(layer.h),
  };
  if (layer.rotation) out.rotation = layer.rotation;
  if (layer.opacity !== 1) out.opacity = layer.opacity;
  if (!layer.visible) out.visible = false;
  if (layer.locked) out.locked = true;
  if (detailed) {
    if (layer.blendMode && layer.blendMode !== 'normal')
      out.blendMode = layer.blendMode;
    if (layer.effects) out.effects = layer.effects;
    if (layer.sticker) out.sticker = layer.sticker;
  }

  if (layer.type === 'text') {
    out.text = resolveLocaleValue(layer.text, locale);
    if (detailed) out.style = layer.style;
    else out.fontSize = layer.style.fontSize;
  } else if (layer.type === 'list') {
    out.items = layer.items.map((item) =>
      resolveLocaleValue(item.text, locale),
    );
    if (detailed) {
      out.marker = { kind: layer.marker.kind, color: layer.marker.color };
      out.style = layer.style;
    }
  } else if (layer.type === 'shape') {
    out.shape = layer.shape;
    if (detailed) {
      out.fill = layer.fill.type === 'image' ? { type: 'image' } : layer.fill;
      if (layer.stroke) out.stroke = layer.stroke;
      if (layer.cornerRadius) out.cornerRadius = layer.cornerRadius;
    }
  } else if (isGroupLayer(layer)) {
    out.children = layer.children.map((child) =>
      describeLayer(child, locale, detailed),
    );
  }
  return out;
}

export function describeArtboardForEdit(
  artboard: CalqoArtboard,
  locale: string,
): unknown {
  const build = (detailed: boolean) => ({
    width: artboard.width,
    height: artboard.height,
    background:
      artboard.background.type === 'image'
        ? { type: 'image' }
        : artboard.background,
    // First layer is at the back.
    layers: artboard.layers.map((layer) =>
      describeLayer(layer, locale, detailed),
    ),
  });
  const detailed = build(true);
  return JSON.stringify(detailed).length <= MAX_ARTBOARD_JSON_CHARS
    ? detailed
    : build(false);
}

interface Normalized {
  operations: unknown[];
  issues: string[];
  warnings: string[];
}

/** Turn the model's shorthand into strict MCP operations, and refuse what the
 * in-app assistant is not allowed to do before anything reaches the executor. */
export function normalizeDesignEditOperations(
  raw: unknown,
  artboard: CalqoArtboard,
  locale: string,
  fonts: string[],
): Normalized {
  const issues: string[] = [];
  const warnings: string[] = [];
  const operations: unknown[] = [];
  if (!Array.isArray(raw)) {
    return { operations, issues: ['"operations" must be an array.'], warnings };
  }
  const existing = new Map(
    flattenLayers(artboard.layers).map((layer) => [layer.id, layer]),
  );
  const context = { locale, fonts };
  const artboardBox = { width: artboard.width, height: artboard.height };
  const lockedName = (id: unknown): string | null => {
    const layer = typeof id === 'string' ? existing.get(id) : undefined;
    return layer?.locked ? layer.name : null;
  };

  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(`operations[${index}] is not an object.`);
      return;
    }
    const type = entry.type;
    if (
      typeof type !== 'string' ||
      !(DESIGN_EDIT_OPERATIONS as readonly string[]).includes(type)
    ) {
      issues.push(
        `operations[${index}]: "${String(type)}" is not available. Use one of: ${DESIGN_EDIT_OPERATIONS.join(', ')}.`,
      );
      return;
    }

    if (type === 'updateLayer') {
      const locked = lockedName(entry.layerId);
      if (locked) {
        warnings.push(`${locked} is locked and was left unchanged.`);
        return;
      }
      const target =
        typeof entry.layerId === 'string'
          ? existing.get(entry.layerId)
          : undefined;
      const patch = isRecord(entry.patch) ? { ...entry.patch } : {};
      // Identity fields are not patchable; models often echo them back.
      delete patch.id;
      delete patch.type;
      // Hoist typography written at the top level into `style`.
      if (target && (target.type === 'text' || target.type === 'list')) {
        const style = isRecord(patch.style) ? { ...patch.style } : {};
        for (const key of Object.keys(patch)) {
          if (TEXT_STYLE_KEYS.has(key)) {
            style[key] = patch[key];
            delete patch[key];
          }
        }
        if (Object.keys(style).length > 0) patch.style = style;
      }
      if (typeof patch.text === 'string') patch.text = { [locale]: patch.text };
      if (patch.fill !== undefined)
        patch.fill = normalizeAiFill(patch.fill, '#E5E7EB');
      if (Array.isArray(patch.items) && target?.type === 'list') {
        // Keep row ids and other locales; only the active locale's copy moves.
        patch.items = patch.items.map((item, row) => {
          const previous = target.items[row];
          const value = typeof item === 'string' ? item : undefined;
          if (value === undefined) return item;
          return previous
            ? { ...previous, text: { ...previous.text, [locale]: value } }
            : { id: createId('item'), text: { [locale]: value } };
        });
      }
      operations.push({ type, layerId: entry.layerId, patch });
      return;
    }

    if (type === 'addLayer') {
      const layer = normalizeLayer(entry.layer, context, artboardBox);
      if (!isRecord(layer)) {
        issues.push(`operations[${index}]: addLayer needs a "layer" object.`);
        return;
      }
      const kinds = collectKinds(layer);
      if (kinds.has('image') || kinds.has('svg')) {
        issues.push(
          `operations[${index}]: image and svg layers cannot be created. Draw with shapes and text.`,
        );
        return;
      }
      ensureLayerIds([layer]);
      operations.push({
        type,
        layer,
        ...(typeof entry.index === 'number' ? { index: entry.index } : {}),
      });
      return;
    }

    if (type === 'deleteLayers') {
      const ids = Array.isArray(entry.layerIds)
        ? entry.layerIds
        : entry.layerId !== undefined
          ? [entry.layerId]
          : [];
      const allowed = ids.filter((id) => {
        const locked = lockedName(id);
        if (locked) warnings.push(`${locked} is locked and was not deleted.`);
        return !locked;
      });
      if (allowed.length > 0) operations.push({ type, layerIds: allowed });
      return;
    }

    if (type === 'setArtboardBackground') {
      const background = normalizeAiFill(
        entry.background ?? entry.fill,
        '#FFFFFF',
      );
      if (isRecord(background) && background.type === 'image') {
        issues.push(`operations[${index}]: image backgrounds cannot be set.`);
        return;
      }
      operations.push({ type, background });
      return;
    }

    if (type === 'reorderLayer' || type === 'ungroupLayer') {
      const locked = lockedName(entry.layerId);
      if (locked) {
        warnings.push(`${locked} is locked and was left unchanged.`);
        return;
      }
    }
    operations.push(entry);
  });

  return { operations, issues, warnings };
}

function collectKinds(
  layer: Record<string, unknown>,
  kinds = new Set<string>(),
): Set<string> {
  if (typeof layer.type === 'string') kinds.add(layer.type);
  if (isRecord(layer.fill) && layer.fill.type === 'image') kinds.add('image');
  if (Array.isArray(layer.children)) {
    for (const child of layer.children) {
      if (isRecord(child)) collectKinds(child, kinds);
    }
  }
  return kinds;
}

function fontsFor(project: CalqoProject): string[] {
  const fonts = new Set(BUNDLED_FONTS.map((font) => font.family));
  for (const artboard of project.artboards) {
    for (const layer of flattenLayers(artboard.layers)) {
      if (layer.type === 'text' || layer.type === 'list') {
        fonts.add(layer.style.fontFamily);
      }
    }
  }
  return [...fonts];
}

function validationIssues(error: McpOperationError): string[] | undefined {
  const details = error.payload.details;
  if (!isRecord(details) || !Array.isArray(details.issues)) return undefined;
  return details.issues.map((issue) =>
    isRecord(issue)
      ? `${String(issue.path ?? '')}: ${String(issue.message ?? '')}`
      : String(issue),
  );
}

/** Ask the model to edit the artboard and apply its answer. One repair retry
 * feeds validation errors back, mirroring prompt-a-template. */
export async function editDesign(
  provider: AIProvider,
  project: CalqoProject,
  request: DesignEditRequest,
  signal?: AbortSignal,
  onProgress?: (progress: CompletionProgress & { attempt: number }) => void,
): Promise<DesignEditOutcome> {
  if (!provider.complete) {
    return {
      ok: false,
      reason: 'unsupported',
      error: 'This provider cannot edit designs.',
    };
  }
  const artboard = project.artboards.find((ab) => ab.id === request.artboardId);
  if (!artboard) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'The artboard no longer exists.',
    };
  }
  const locale = project.activeContentLocale;
  const fonts = fontsFor(project);
  const baseRevision = projectRevision(project);
  const preview = provider.capabilities.vision ? request.preview : undefined;
  const baseDiagnostics: AIProviderDiagnostics = {
    providerId: provider.id,
    providerLabel: provider.label,
    modelId: provider.modelId,
  };

  let repair: { error: string; issues?: string[] } | undefined;
  let last: Extract<DesignEditOutcome, { ok: false }> | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { system, user } = buildDesignEditPrompt({
      instruction: request.instruction,
      locale,
      width: artboard.width,
      height: artboard.height,
      artboard: describeArtboardForEdit(artboard, locale),
      selectedLayerIds: request.selectedLayerIds,
      fonts,
      maxOperations: MAX_DESIGN_EDIT_OPERATIONS,
      hasPreview: Boolean(preview),
      repair,
    });
    const completion = await provider.complete({
      system,
      user,
      images: preview ? [preview] : undefined,
      format: 'json',
      signal,
      onProgress:
        onProgress && ((progress) => onProgress({ ...progress, attempt })),
    });
    const diagnostics: AIProviderDiagnostics = {
      ...baseDiagnostics,
      rawOutput: completion.text,
      retryCount: attempt - 1,
      ...(completion.downgrades.length
        ? { warnings: completion.downgrades }
        : {}),
    };
    const fail = (error: string, issues?: string[]) => {
      last = {
        ok: false,
        reason: 'invalid',
        error,
        issues,
        raw: completion.text,
        diagnostics,
      };
      repair = { error, issues };
    };

    const parsed = repairJsonLikeResponse(completion.text);
    if (parsed.error || !isRecord(parsed.value)) {
      fail(parsed.error ?? 'The response was not a JSON object.');
      continue;
    }
    const summary =
      typeof parsed.value.summary === 'string'
        ? parsed.value.summary.trim()
        : '';
    const normalized = normalizeDesignEditOperations(
      parsed.value.operations ?? [],
      artboard,
      locale,
      fonts,
    );
    if (normalized.issues.length > 0) {
      fail('Some operations are not allowed.', normalized.issues);
      continue;
    }
    if (normalized.operations.length > MAX_DESIGN_EDIT_OPERATIONS) {
      fail(
        `Too many operations (${normalized.operations.length}); the limit is ${MAX_DESIGN_EDIT_OPERATIONS}.`,
      );
      continue;
    }
    if (normalized.operations.length === 0) {
      return {
        ok: true,
        summary,
        changed: false,
        changedLayerIds: [],
        warnings: normalized.warnings,
        diagnostics,
      };
    }

    try {
      const applied = executeApplyOperations({
        projectId: request.projectId,
        artboardId: request.artboardId,
        baseRevision,
        operations: normalized.operations,
      });
      return {
        ok: true,
        summary,
        changed: true,
        changedLayerIds: applied.changedLayerIds,
        warnings: [...normalized.warnings, ...applied.warnings],
        diagnostics,
      };
    } catch (error) {
      if (!(error instanceof McpOperationError)) throw error;
      if (error.payload.code === 'REVISION_MISMATCH') {
        return {
          ok: false,
          reason: 'stale',
          error: error.payload.message,
          raw: completion.text,
          diagnostics,
        };
      }
      fail(error.payload.message, validationIssues(error));
    }
  }

  return (
    last ?? {
      ok: false,
      reason: 'invalid',
      error: 'The edit could not be applied.',
    }
  );
}
