import type {
  AIProvider,
  AIProviderDiagnostics,
  AiModelInfo,
  SvgPromptInput,
  SvgPromptResult,
  TemplatePromptInput,
  TemplatePromptResult,
  TranslationJob,
  TranslationResult,
} from './AIProvider';
import type { CompletionRequest, CompletionResult } from './completion';
import {
  TEMPLATE_OUTPUT_SCHEMA,
  TRANSLATION_OUTPUT_SCHEMA,
} from './outputSchemas';
import {
  buildSvgPrompt,
  buildTemplatePrompt,
  buildTranslationPrompt,
} from './prompts';
import { parseTranslationResponse } from './translationResponse';

/** What a backend must supply; the shared factory layers the template,
 * translation and SVG flows on top so every provider behaves the same. */
export interface CompletionBackend {
  id: string;
  label: string;
  modelId: string;
  capabilities: AIProvider['capabilities'];
  complete(request: CompletionRequest): Promise<CompletionResult>;
  listModels?(signal?: AbortSignal): Promise<AiModelInfo[]>;
}

export function createCompletionProvider(
  backend: CompletionBackend,
): AIProvider {
  const baseDiagnostics: AIProviderDiagnostics = {
    providerId: backend.id,
    providerLabel: backend.label,
    modelId: backend.modelId,
  };
  const diagnosticsFor = (result: CompletionResult): AIProviderDiagnostics => ({
    ...baseDiagnostics,
    rawOutput: result.text,
    ...(result.downgrades.length ? { warnings: result.downgrades } : {}),
  });
  const vision = backend.capabilities.vision === true;

  return {
    id: backend.id,
    label: backend.label,
    modelId: backend.modelId,
    capabilities: backend.capabilities,
    complete: backend.complete,
    listModels: backend.listModels,

    async generateTemplate(
      input: TemplatePromptInput,
      signal,
      onProgress,
    ): Promise<TemplatePromptResult> {
      const image = vision ? input.styleReference?.image : undefined;
      // Never describe an attachment the backend will not receive.
      const promptInput: TemplatePromptInput = {
        ...input,
        detail: input.detail ?? backend.capabilities.promptProfile ?? 'full',
        styleReference: input.styleReference
          ? { ...input.styleReference, image }
          : undefined,
      };
      const { system, user } = buildTemplatePrompt(promptInput);
      const result = await backend.complete({
        system,
        user,
        images: image ? [image] : undefined,
        format: 'json',
        schema: TEMPLATE_OUTPUT_SCHEMA,
        signal,
        onProgress,
      });
      return { raw: result.text, diagnostics: diagnosticsFor(result) };
    },

    async generateSvg(
      input: SvgPromptInput,
      signal?: AbortSignal,
    ): Promise<SvgPromptResult> {
      const { system, user } = buildSvgPrompt(input);
      const result = await backend.complete({
        system,
        user,
        format: 'text',
        signal,
      });
      return { raw: result.text, diagnostics: diagnosticsFor(result) };
    },

    async translate(
      job: TranslationJob,
      signal?: AbortSignal,
    ): Promise<TranslationResult> {
      const { system, user } = buildTranslationPrompt(job);
      const result = await backend.complete({
        system,
        user,
        format: 'json',
        schema: TRANSLATION_OUTPUT_SCHEMA,
        signal,
      });
      // Map back onto the requested items; fall back to source text so a
      // partial response never drops a layer (the service reports the gaps).
      return parseTranslationResponse(result.text, job, {
        ...baseDiagnostics,
        ...(result.downgrades.length ? { warnings: result.downgrades } : {}),
      });
    },
  };
}
