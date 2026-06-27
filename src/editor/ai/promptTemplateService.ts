import { BUNDLED_FONTS } from '@/lib/adapters/fonts/browserFontAdapter';
import { ARTBOARD_PRESETS, type ArtboardPresetId } from '@/lib/schema/presets';
import type { LocaleCode } from '@/lib/schema';
import { STROKE_LOOK_IDS } from '@/editor/canvas/strokePresets';
import { FRAME_PRESET_IDS } from '@/editor/images/framePresets';
import type { AIProvider, StyleReference, TemplatePromptInput } from './AIProvider';
import { validateTemplateResponse, type TemplateValidation } from './validation';

/** Prototype cap on generated layers (plan §14.6). */
export const MAX_TEMPLATE_LAYERS = 20;

export interface TemplateRequest {
  prompt: string;
  preset: ArtboardPresetId;
  locale: LocaleCode;
  palette?: string[];
  styleReference?: StyleReference;
}

/** Expand a UI-level request into the full provider input, pinning canvas
 * dimensions, the font allow-list, and the layer cap (plan §14.6–14.7). */
export function buildTemplateInput(request: TemplateRequest): TemplatePromptInput {
  const preset = ARTBOARD_PRESETS[request.preset];
  return {
    prompt: request.prompt,
    preset: request.preset,
    width: preset.width,
    height: preset.height,
    locale: request.locale,
    palette: request.palette,
    styleReference: request.styleReference,
    maxLayers: MAX_TEMPLATE_LAYERS,
    fonts: BUNDLED_FONTS.map((f) => f.family),
    strokeLooks: [...STROKE_LOOK_IDS],
    frameKinds: [...FRAME_PRESET_IDS],
  };
}

/** Generate and validate a template project from a prompt (plan §14.5). The
 * returned validation carries either the editable project or repair-friendly
 * diagnostics plus the raw output. */
export async function generateTemplate(
  provider: AIProvider,
  request: TemplateRequest,
  signal?: AbortSignal,
): Promise<TemplateValidation> {
  const input = buildTemplateInput(request);
  const result = await provider.generateTemplate(input, signal);
  const validation = validateTemplateResponse(result.raw, input, result.diagnostics);
  if (validation.ok) return validation;

  const retryInput: TemplatePromptInput = {
    ...input,
    repair: {
      error: validation.error,
      issues: validation.issues,
      raw: result.raw,
    },
  };
  const retry = await provider.generateTemplate(retryInput, signal);
  const retryValidation = validateTemplateResponse(retry.raw, retryInput, {
    providerId: provider.id,
    ...retry.diagnostics,
    retryCount: 1,
  });
  if (retryValidation.ok) return retryValidation;
  return {
    ...retryValidation,
    diagnostics: {
      providerId: provider.id,
      ...retryValidation.diagnostics,
      retryCount: 1,
      rawOutput: retry.raw,
    },
  };
}
