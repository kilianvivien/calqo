import {
  CURRENT_SCHEMA_VERSION,
  safeImportProject,
  type BackgroundFill,
  type CalqoLayer,
  type CalqoProject,
} from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import type { AIProviderDiagnostics, TemplatePromptInput } from './AIProvider';

export interface JsonRepairResult {
  value?: unknown;
  error?: string;
}

/** Best-effort recovery of a JSON object from a model response: strips markdown
 * fences and trims to the outermost braces before parsing (plan §14.9). Does not
 * attempt structural repair — that is the validator's job. */
export function repairJsonLikeResponse(raw: string): JsonRepairResult {
  if (!raw || typeof raw !== 'string') {
    return { error: 'Empty response.' };
  }
  let text = raw.trim();

  // Strip a ```json … ``` (or bare ```) fence if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Fall back to the outermost { … } span.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    return { error: 'No JSON object found in response.' };
  }
  const candidate = text.slice(first, last + 1);

  try {
    return { value: JSON.parse(candidate) };
  } catch (err) {
    return { error: `JSON parse failed: ${(err as Error).message}` };
  }
}

/** Recursively mint ids for any layer (and group children) missing one, so a
 * model that omits ids still produces a valid, editable document. */
function ensureLayerIds(layers: unknown): void {
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    if (layer && typeof layer === 'object') {
      const l = layer as Record<string, unknown>;
      if (typeof l.id !== 'string' || l.id.length === 0) l.id = createId('layer');
      if (l.type === 'group') ensureLayerIds(l.children);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function solidFill(value: unknown, fallback = '#FFFFFF'): unknown {
  if (typeof value === 'string') return { type: 'solid', color: value };
  if (!isRecord(value)) return { type: 'solid', color: fallback };
  if (!value.type && typeof value.color === 'string') return { ...value, type: 'solid' };
  if (value.type === 'color' && typeof value.color === 'string') {
    return { ...value, type: 'solid' };
  }
  return value;
}

function normalizeTextRecord(value: unknown, locale: string, fallback: string): Record<string, string> {
  if (typeof value === 'string') return { [locale]: value };
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string',
    );
    if (entries.length > 0) return Object.fromEntries(entries);
  }
  return { [locale]: fallback };
}

function normalizeTextStyle(value: unknown, input: TemplatePromptInput): Record<string, unknown> {
  const style = isRecord(value) ? { ...value } : {};
  style.fontFamily = stringValue(style.fontFamily) ?? input.fonts[0] ?? 'Inter';
  style.fontSize = numberValue(style.fontSize, style.size) ?? 48;
  style.fontWeight = numberValue(style.fontWeight, style.weight) ?? style.fontWeight ?? 700;
  style.fontStyle = style.fontStyle === 'italic' ? 'italic' : 'normal';
  style.textDecoration = style.textDecoration === 'underline' ? 'underline' : 'none';
  style.color = stringValue(style.color, style.fill) ?? '#111827';
  style.align = ['left', 'center', 'right', 'justify'].includes(String(style.align))
    ? style.align
    : 'left';
  style.lineHeight = numberValue(style.lineHeight) ?? 1.2;
  style.letterSpacing = numberValue(style.letterSpacing) ?? 0;
  return style;
}

function normalizeLayerBox(layer: Record<string, unknown>, artboard: Record<string, unknown>): void {
  const artboardWidth = numberValue(artboard.width) ?? 1080;
  const artboardHeight = numberValue(artboard.height) ?? 1080;
  layer.x = numberValue(layer.x, layer.left) ?? 0;
  layer.y = numberValue(layer.y, layer.top) ?? 0;
  layer.w = numberValue(layer.w, layer.width) ?? Math.round(artboardWidth * 0.6);
  layer.h = numberValue(layer.h, layer.height) ?? Math.round(artboardHeight * 0.12);
  if (typeof layer.name !== 'string' || layer.name.length === 0) {
    layer.name = stringValue(layer.label) ?? `${String(layer.type ?? 'Layer')} layer`;
  }
}

function inferLayerType(layer: Record<string, unknown>): string | undefined {
  const type = stringValue(layer.type);
  if (type) return type;
  if (typeof layer.text === 'string' || typeof layer.content === 'string') return 'text';
  if (Array.isArray(layer.items) || Array.isArray(layer.list)) return 'list';
  if (stringValue(layer.shape) || stringValue(layer.kind)) return 'shape';
  return undefined;
}

function normalizeListItems(value: unknown, input: TemplatePromptInput): unknown[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => {
    if (typeof item === 'string') {
      return { id: createId('item'), text: { [input.locale]: item } };
    }
    if (!isRecord(item)) {
      return { id: createId('item'), text: { [input.locale]: '' } };
    }
    const normalized = { ...item };
    if (typeof normalized.id !== 'string' || normalized.id.length === 0) {
      normalized.id = createId('item');
    }
    normalized.text = normalizeTextRecord(normalized.text, input.locale, '');
    return normalized;
  });
}

function normalizeLayer(layer: unknown, input: TemplatePromptInput, artboard: Record<string, unknown>): unknown {
  if (!isRecord(layer)) return layer;
  const normalized = { ...layer };
  normalized.type = inferLayerType(normalized);
  normalizeLayerBox(normalized, artboard);

  if (normalized.type === 'text') {
    normalized.text = normalizeTextRecord(
      normalized.text ?? normalized.content ?? normalized.label,
      input.locale,
      '',
    );
    normalized.style = normalizeTextStyle(normalized.style, input);
  } else if (normalized.type === 'list') {
    normalized.items = normalizeListItems(normalized.items ?? normalized.list, input);
    if (!isRecord(normalized.marker)) {
      normalized.marker = { kind: 'bullet', color: '#111827' };
    }
    normalized.style = normalizeTextStyle(normalized.style, input);
  } else if (normalized.type === 'shape') {
    const shape = stringValue(normalized.shape, normalized.kind) ?? 'rect';
    normalized.shape = shape === 'circle' ? 'ellipse' : shape;
    normalized.fill = solidFill(normalized.fill ?? normalized.color, '#E5E7EB');
  } else if (normalized.type === 'group') {
    normalized.children = Array.isArray(normalized.children)
      ? normalized.children.map((child) => normalizeLayer(child, input, artboard))
      : [];
  }

  return normalized;
}

/** Fill the project/artboard envelope that models routinely omit (ids,
 * timestamps, schema version, locale list) using the request as the source of
 * truth, then validate with the strict importer (plan §3.10, §14.6). This is the
 * "repair-friendly" path: it normalizes common model shorthand before the
 * strict importer enforces the real project contract. */
export function normalizeTemplateDocument(
  raw: unknown,
  input: TemplatePromptInput,
): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const doc = structuredClone(raw) as Record<string, unknown>;
  const now = new Date().toISOString();

  doc.schemaVersion = CURRENT_SCHEMA_VERSION;
  if (typeof doc.id !== 'string') doc.id = createId('proj');
  if (typeof doc.name !== 'string' || doc.name.length === 0) {
    doc.name = input.prompt.slice(0, 60) || 'AI template';
  }
  if (typeof doc.createdAt !== 'string') doc.createdAt = now;
  doc.updatedAt = now;

  if (!Array.isArray(doc.contentLocales) || doc.contentLocales.length === 0) {
    doc.contentLocales = [input.locale];
  }
  if (typeof doc.activeContentLocale !== 'string') {
    doc.activeContentLocale = input.locale;
  }
  if (!Array.isArray(doc.palette)) doc.palette = input.palette ?? [];
  if (!Array.isArray(doc.assets)) doc.assets = [];
  if (!Array.isArray(doc.glossary)) doc.glossary = [];

  if (Array.isArray(doc.artboards)) {
    for (const artboard of doc.artboards) {
      if (artboard && typeof artboard === 'object') {
        const ab = artboard as Record<string, unknown>;
        if (typeof ab.id !== 'string' || ab.id.length === 0) ab.id = createId('ab');
        if (typeof ab.preset !== 'string') ab.preset = input.preset;
        if (typeof ab.width !== 'number') ab.width = input.width;
        if (typeof ab.height !== 'number') ab.height = input.height;
        if (typeof ab.name !== 'string') ab.name = 'Artboard';
        ab.background = solidFill(ab.background, '#FFFFFF');
        if (Array.isArray(ab.layers)) {
          ab.layers = ab.layers.map((layer) => normalizeLayer(layer, input, ab));
        }
        ensureLayerIds(ab.layers);
      }
    }
  }
  return doc;
}

export type TemplateValidation =
  | { ok: true; project: CalqoProject; warnings?: string[]; diagnostics?: AIProviderDiagnostics }
  | {
      ok: false;
      error: string;
      issues?: string[];
      raw: string;
      diagnostics?: AIProviderDiagnostics;
    };

interface TemplateQualityResult {
  issues: string[];
  warnings: string[];
}

function diagnosticBase(diagnostics?: AIProviderDiagnostics): AIProviderDiagnostics {
  return diagnostics ?? { providerId: 'unknown' };
}

function walkLayers(
  layers: CalqoLayer[],
  visit: (layer: CalqoLayer, parentX: number, parentY: number) => void,
  parentX = 0,
  parentY = 0,
): void {
  for (const layer of layers) {
    visit(layer, parentX, parentY);
    if (layer.type === 'group') {
      walkLayers(layer.children, visit, parentX + layer.x, parentY + layer.y);
    }
  }
}

function countLayers(layers: CalqoLayer[]): number {
  let count = 0;
  walkLayers(layers, () => {
    count += 1;
  });
  return count;
}

function isHexColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}

function parseHex(color: string): [number, number, number] | null {
  if (!isHexColor(color)) return null;
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function luminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return null;
  const fgL = 0.2126 * luminance(fg[0]) + 0.7152 * luminance(fg[1]) + 0.0722 * luminance(fg[2]);
  const bgL = 0.2126 * luminance(bg[0]) + 0.7152 * luminance(bg[1]) + 0.0722 * luminance(bg[2]);
  const lighter = Math.max(fgL, bgL);
  const darker = Math.min(fgL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

function solidBackgroundColor(background: BackgroundFill): string | null {
  return background.type === 'solid' ? background.color : null;
}

/** Product-level checks for AI templates after the schema contract passes. */
export function checkTemplateQuality(
  project: CalqoProject,
  input: TemplatePromptInput,
): TemplateQualityResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const totalLayers = project.artboards.reduce(
    (sum, artboard) => sum + countLayers(artboard.layers),
    0,
  );
  if (totalLayers > input.maxLayers) {
    issues.push(`Layer count ${totalLayers} exceeds requested cap ${input.maxLayers}.`);
  }

  if (project.assets.length > 0) {
    issues.push('AI templates cannot include external asset records.');
  }

  for (const artboard of project.artboards) {
    if (artboard.background.type === 'image') {
      issues.push(`${artboard.name}: image backgrounds are not allowed in AI output.`);
    }
    const bgColor = solidBackgroundColor(artboard.background);
    if (!bgColor || !isHexColor(bgColor)) {
      warnings.push(`${artboard.name}: background should be a solid hex color for reliable export.`);
    }

    walkLayers(artboard.layers, (layer, parentX, parentY) => {
      const x = parentX + layer.x;
      const y = parentY + layer.y;
      if (layer.type === 'image' || layer.type === 'svg') {
        issues.push(`${layer.name}: external asset layers are not allowed in AI output.`);
      }
      if (layer.type === 'shape' && layer.fill.type === 'image') {
        issues.push(`${layer.name}: image fills are not allowed in AI output.`);
      }
      if (layer.type === 'list' && layer.marker.kind === 'asset') {
        issues.push(`${layer.name}: asset-backed list markers are not allowed in AI output.`);
      }
      // Phase R: a stroke look / image frame the model requested that is valid
      // schema but outside the supported preset set degrades to a warning rather
      // than a hard failure.
      if (
        layer.type === 'shape' &&
        layer.stroke?.look &&
        input.strokeLooks &&
        !input.strokeLooks.includes(layer.stroke.look)
      ) {
        warnings.push(`${layer.name}: stroke look "${layer.stroke.look}" is not a supported preset.`);
      }
      if (
        layer.type === 'image' &&
        layer.frame &&
        input.frameKinds &&
        !input.frameKinds.includes(layer.frame.kind)
      ) {
        warnings.push(`${layer.name}: frame "${layer.frame.kind}" is not a supported preset.`);
      }
      if (x < 0 || y < 0 || x + layer.w > artboard.width || y + layer.h > artboard.height) {
        warnings.push(`${layer.name}: layer falls outside the artboard bounds.`);
      }
      if (layer.type === 'text' && bgColor && isHexColor(layer.style.color)) {
        const ratio = contrastRatio(layer.style.color, bgColor);
        if (ratio !== null && ratio < 4.5) {
          warnings.push(`${layer.name}: text contrast is low against the artboard background.`);
        }
      }
      if (layer.type === 'list' && bgColor && isHexColor(layer.style.color)) {
        const ratio = contrastRatio(layer.style.color, bgColor);
        if (ratio !== null && ratio < 4.5) {
          warnings.push(`${layer.name}: list text contrast is low against the artboard background.`);
        }
      }
    });
  }

  return { issues, warnings };
}

/** Run the full parse → repair → normalize → validate pipeline for a raw
 * template response. */
export function validateTemplateResponse(
  raw: string,
  input: TemplatePromptInput,
  diagnostics?: AIProviderDiagnostics,
): TemplateValidation {
  const repaired = repairJsonLikeResponse(raw);
  if (repaired.error || repaired.value === undefined) {
    const error = repaired.error ?? 'Unparseable response.';
    return {
      ok: false,
      error,
      raw,
      diagnostics: {
        ...diagnosticBase(diagnostics),
        parseFailure: error,
        rawOutput: raw,
      },
    };
  }
  const normalized = normalizeTemplateDocument(repaired.value, input);
  const result = safeImportProject(normalized);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      issues: result.issues,
      raw,
      diagnostics: {
        ...diagnosticBase(diagnostics),
        validationFailure: result.error,
        rawOutput: raw,
      },
    };
  }
  const quality = checkTemplateQuality(result.project, input);
  if (quality.issues.length > 0) {
    const error = 'Generated project failed AI template quality checks.';
    return {
      ok: false,
      error,
      issues: quality.issues,
      raw,
      diagnostics: {
        ...diagnosticBase(diagnostics),
        validationFailure: error,
        rawOutput: raw,
        warnings: quality.warnings,
      },
    };
  }
  return {
    ok: true,
    project: result.project,
    warnings: quality.warnings,
    diagnostics: {
      ...diagnosticBase(diagnostics),
      rawOutput: raw,
      warnings: quality.warnings,
    },
  };
}
