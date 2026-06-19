import {
  CURRENT_SCHEMA_VERSION,
  safeImportProject,
  type CalqoProject,
} from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import type { TemplatePromptInput } from './AIProvider';

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

/** Fill the project/artboard envelope that models routinely omit (ids,
 * timestamps, schema version, locale list) using the request as the source of
 * truth, then validate with the strict importer (plan §3.10, §14.6). This is the
 * "repair-friendly" path: it normalizes shape but never invents layer geometry. */
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
        if (!ab.background) ab.background = { type: 'solid', color: '#FFFFFF' };
        ensureLayerIds(ab.layers);
      }
    }
  }
  return doc;
}

export type TemplateValidation =
  | { ok: true; project: CalqoProject }
  | { ok: false; error: string; issues?: string[]; raw: string };

/** Run the full parse → repair → normalize → validate pipeline for a raw
 * template response. */
export function validateTemplateResponse(
  raw: string,
  input: TemplatePromptInput,
): TemplateValidation {
  const repaired = repairJsonLikeResponse(raw);
  if (repaired.error || repaired.value === undefined) {
    return { ok: false, error: repaired.error ?? 'Unparseable response.', raw };
  }
  const normalized = normalizeTemplateDocument(repaired.value, input);
  const result = safeImportProject(normalized);
  if (result.ok) return { ok: true, project: result.project };
  return { ok: false, error: result.error, issues: result.issues, raw };
}
