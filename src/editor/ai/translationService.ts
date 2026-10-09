import type { CalqoLayer, CalqoProject, LocaleCode } from '@/lib/schema';
import {
  decodeListRowId,
  detectTextOverflow,
  extractTranslationItems,
  type TranslationScope,
} from '@/editor/i18n-content/translationPipeline';
import { isGroupLayer } from '@/editor/utils/layers';
import type { AIProvider, TranslationJob, TranslationResult } from './AIProvider';

export interface TranslationRequest {
  sourceLocale: LocaleCode;
  targetLocale: LocaleCode;
  scope: TranslationScope;
  activeArtboardId: string | null;
}

/** Assemble a translation job from the project's text layers + glossary. */
export function buildTranslationJob(
  project: CalqoProject,
  request: TranslationRequest,
): TranslationJob {
  return {
    sourceLocale: request.sourceLocale,
    targetLocale: request.targetLocale,
    glossary: project.glossary,
    items: extractTranslationItems(
      project,
      request.sourceLocale,
      request.scope,
      request.activeArtboardId,
    ),
  };
}

/** Validate a provider response against the requested job: drop items that map
 * to unknown layers and report how many were translated (plan §13.4). */
export function reconcileTranslation(
  job: TranslationJob,
  result: TranslationResult,
): {
  result: TranslationResult;
  accepted: number;
  unchanged: number;
  missingLayerIds: string[];
} {
  const known = new Map(job.items.map((item) => [item.layerId, item]));
  const seen = new Set<string>();
  for (const item of result.items) {
    if (known.has(item.layerId)) seen.add(item.layerId);
  }
  const items = job.items.map((item) => {
    const translated = result.items.find((candidate) => candidate.layerId === item.layerId);
    return translated
      ? { ...translated, artboardId: item.artboardId }
      : {
          layerId: item.layerId,
          artboardId: item.artboardId,
          translatedText: item.sourceText,
          notes: 'missing-provider-output',
        };
  });
  const missingLayerIds =
    result.diagnostics?.missingLayerIds ??
    job.items.filter((item) => !seen.has(item.layerId)).map((item) => item.layerId);
  let unchanged = 0;
  for (const item of items) {
    if (item.translatedText === known.get(item.layerId)?.sourceText) unchanged += 1;
  }
  return {
    result: { targetLocale: result.targetLocale, items, diagnostics: result.diagnostics },
    accepted: items.length,
    unchanged,
    missingLayerIds,
  };
}

/** Items per provider call. Keeps each request well inside output limits and
 * means one bad batch cannot lose a whole multi-artboard project. */
export const TRANSLATION_CHUNK_SIZE = 40;

async function translateInChunks(
  provider: AIProvider,
  job: TranslationJob,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  if (job.items.length <= TRANSLATION_CHUNK_SIZE) {
    return provider.translate(job, signal);
  }
  const items: TranslationResult['items'] = [];
  const missingLayerIds: string[] = [];
  let diagnostics: TranslationResult['diagnostics'];
  for (let start = 0; start < job.items.length; start += TRANSLATION_CHUNK_SIZE) {
    const chunk = { ...job, items: job.items.slice(start, start + TRANSLATION_CHUNK_SIZE) };
    const result = await provider.translate(chunk, signal);
    items.push(...result.items);
    missingLayerIds.push(...(result.diagnostics?.missingLayerIds ?? []));
    diagnostics = result.diagnostics ?? diagnostics;
  }
  return {
    targetLocale: job.targetLocale,
    items,
    diagnostics: diagnostics && { ...diagnostics, missingLayerIds },
  };
}

type TextLayer = Extract<CalqoLayer, { type: 'text' }>;

function findTextLayer(layers: CalqoLayer[], id: string): TextLayer | null {
  for (const layer of layers) {
    if (layer.id === id) return layer.type === 'text' ? layer : null;
    if (isGroupLayer(layer)) {
      const found = findTextLayer(layer.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** Text-layer translations that no longer fit the box the source text fits in.
 * List rows are left alone: their height is shared across the whole list. */
export function findOverflowingTranslations(
  project: CalqoProject,
  result: TranslationResult,
): TranslationResult['items'] {
  return result.items.filter((item) => {
    if (decodeListRowId(item.layerId)) return false;
    const artboard = project.artboards.find((ab) => ab.id === item.artboardId);
    const layer = artboard && findTextLayer(artboard.layers, item.layerId);
    if (!layer) return false;
    const candidate: TextLayer = {
      ...layer,
      text: { ...layer.text, [result.targetLocale]: item.translatedText },
    };
    return Boolean(detectTextOverflow(candidate, result.targetLocale));
  });
}

export interface TranslationRun {
  job: TranslationJob;
  result: TranslationResult;
  accepted: number;
  unchanged: number;
  missingLayerIds: string[];
  /** Translations rewritten shorter because the first pass overflowed. */
  shortened: number;
  /** Layers that still overflow after the shortening pass. */
  overflowLayerIds: string[];
}

/** Run a translation end-to-end: build the job, call the provider, reconcile,
 * then ask once more for shorter wording wherever the result overflows. */
export async function runTranslation(
  provider: AIProvider,
  project: CalqoProject,
  request: TranslationRequest,
  signal?: AbortSignal,
): Promise<TranslationRun> {
  const job = buildTranslationJob(project, request);
  if (job.items.length === 0) {
    return {
      job,
      result: { targetLocale: request.targetLocale, items: [] },
      accepted: 0,
      unchanged: 0,
      missingLayerIds: [],
      shortened: 0,
      overflowLayerIds: [],
    };
  }
  const raw = await translateInChunks(provider, job, signal);
  const reconciled = reconcileTranslation(job, raw);
  let result = reconciled.result;
  let shortened = 0;

  const overflowing = findOverflowingTranslations(project, result);
  if (overflowing.length > 0) {
    const sourceById = new Map(job.items.map((item) => [item.layerId, item]));
    const fitJob: TranslationJob = {
      ...job,
      items: overflowing.flatMap((item) => {
        const source = sourceById.get(item.layerId);
        return source
          ? [
              {
                ...source,
                previousTranslation: item.translatedText,
                // The source text fits the box, so its length is a safe target.
                maxCharsHint: Math.max(4, source.sourceText.length),
              },
            ]
          : [];
      }),
    };
    try {
      const refit = await translateInChunks(provider, fitJob, signal);
      const shorter = new Map<string, string>();
      for (const item of refit.items) {
        const previous = overflowing.find((o) => o.layerId === item.layerId);
        if (
          item.notes !== 'missing-provider-output' &&
          previous &&
          item.translatedText.trim() &&
          item.translatedText.length < previous.translatedText.length
        ) {
          shorter.set(item.layerId, item.translatedText);
        }
      }
      shortened = shorter.size;
      result = {
        ...result,
        items: result.items.map((item) =>
          shorter.has(item.layerId)
            ? { ...item, translatedText: shorter.get(item.layerId)! }
            : item,
        ),
      };
    } catch (error) {
      // The first pass is still a usable translation; keep it.
      if (signal?.aborted) throw error;
    }
  }

  return {
    job,
    result,
    accepted: reconciled.accepted,
    unchanged: reconciled.unchanged,
    missingLayerIds: reconciled.missingLayerIds,
    shortened,
    overflowLayerIds: findOverflowingTranslations(project, result).map(
      (item) => item.layerId,
    ),
  };
}

/** Translate into several locales in sequence, reporting each as it lands. A
 * locale that fails is recorded and the rest still run. */
export async function runTranslations(
  provider: AIProvider,
  project: CalqoProject,
  request: Omit<TranslationRequest, 'targetLocale'> & { targetLocales: LocaleCode[] },
  signal?: AbortSignal,
  onProgress?: (done: number, total: number, locale: LocaleCode) => void,
): Promise<{ runs: TranslationRun[]; failedLocales: LocaleCode[] }> {
  const runs: TranslationRun[] = [];
  const failedLocales: LocaleCode[] = [];
  const { targetLocales, ...base } = request;
  for (const [index, targetLocale] of targetLocales.entries()) {
    onProgress?.(index, targetLocales.length, targetLocale);
    try {
      runs.push(await runTranslation(provider, project, { ...base, targetLocale }, signal));
    } catch (error) {
      if (signal?.aborted) throw error;
      console.error('[Calqo] translation failed for locale', targetLocale, error);
      failedLocales.push(targetLocale);
    }
  }
  return { runs, failedLocales };
}
