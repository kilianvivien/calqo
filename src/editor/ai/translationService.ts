import type { CalqoProject, LocaleCode } from '@/lib/schema';
import {
  extractTranslationItems,
  type TranslationScope,
} from '@/editor/i18n-content/translationPipeline';
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
): { result: TranslationResult; accepted: number; unchanged: number } {
  const known = new Map(job.items.map((item) => [item.layerId, item]));
  const items = result.items.filter((item) => known.has(item.layerId));
  let unchanged = 0;
  for (const item of items) {
    if (item.translatedText === known.get(item.layerId)?.sourceText) unchanged += 1;
  }
  return {
    result: { targetLocale: result.targetLocale, items },
    accepted: items.length,
    unchanged,
  };
}

/** Run a translation end-to-end: build the job, call the provider, reconcile. */
export async function runTranslation(
  provider: AIProvider,
  project: CalqoProject,
  request: TranslationRequest,
  signal?: AbortSignal,
): Promise<{
  job: TranslationJob;
  result: TranslationResult;
  accepted: number;
  unchanged: number;
}> {
  const job = buildTranslationJob(project, request);
  const raw = await provider.translate(job, signal);
  const { result, accepted, unchanged } = reconcileTranslation(job, raw);
  return { job, result, accepted, unchanged };
}
