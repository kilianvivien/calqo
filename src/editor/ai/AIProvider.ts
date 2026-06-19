import type { GlossaryEntry, LocaleCode } from '@/lib/schema';

/** A style reference the model should mimic: a sample image URL and/or a palette
 * extracted from an uploaded sample, plus a free-text note. */
export interface StyleReference {
  /** URL of a reference image to imitate the look of. */
  url?: string;
  /** Colours sampled from an uploaded reference image. */
  palette?: string[];
  /** Free-text style note (e.g. "match this brand's mood"). */
  note?: string;
}

/** Input for prompt-a-template generation (plan §14.5). */
export interface TemplatePromptInput {
  /** Natural-language description of the visual to generate. */
  prompt: string;
  /** Target artboard preset id (drives canvas dimensions). */
  preset: string;
  width: number;
  height: number;
  /** Locale the generated copy should be written in. */
  locale: LocaleCode;
  /** Optional brand palette the model is asked to use. */
  palette?: string[];
  /** Optional style reference (sample image / URL) to mimic. */
  styleReference?: StyleReference;
  /** Hard cap on layers the model may emit (plan §14.6). */
  maxLayers: number;
  /** Allowed font families the model may use. */
  fonts: string[];
  /** Optional second-pass repair context after parse/schema/quality failure. */
  repair?: {
    error: string;
    issues?: string[];
    raw: string;
  };
}

/** Input for AI SVG generation. */
export interface SvgPromptInput {
  /** Natural-language description of the icon/graphic to draw. */
  prompt: string;
  /** Primary colour hint for the generated mark. */
  color?: string;
}

/** Raw provider output for an SVG request. */
export interface SvgPromptResult {
  /** Raw text returned by the provider (expected to contain `<svg>…</svg>`). */
  raw: string;
  diagnostics?: AIProviderDiagnostics;
}

/** Raw provider output for a template request — kept as text so the caller can
 * repair/validate it and surface diagnostics on failure. */
export interface TemplatePromptResult {
  /** Raw text returned by the provider (may include fences/prose). */
  raw: string;
  diagnostics?: AIProviderDiagnostics;
}

/** A single string to translate, traced back to its layer/artboard. */
export interface TranslationItem {
  layerId: string;
  artboardId: string;
  sourceText: string;
  context?: string;
  maxCharsHint?: number;
}

/** A translation request bundle (plan §13.3). */
export interface TranslationJob {
  sourceLocale: LocaleCode;
  targetLocale: LocaleCode;
  glossary: GlossaryEntry[];
  items: TranslationItem[];
}

export interface TranslationResultItem {
  layerId: string;
  artboardId: string;
  translatedText: string;
  confidence?: number;
  notes?: string;
}

/** A translation response (plan §13.4). */
export interface TranslationResult {
  targetLocale: LocaleCode;
  items: TranslationResultItem[];
  diagnostics?: AIProviderDiagnostics;
}

export interface AIProviderDiagnostics {
  providerId: string;
  providerLabel?: string;
  modelId?: string;
  timeoutMs?: number;
  retryCount?: number;
  parseFailure?: string;
  validationFailure?: string;
  rawOutput?: string;
  missingLayerIds?: string[];
  warnings?: string[];
}

/** The provider abstraction shared by mock and real backends (plan §14.1).
 * Implementations must never throw for control flow — surface failures through
 * the returned shapes or thrown errors the services catch. */
export interface AIProvider {
  /** Implementation id, e.g. "mock" or "openai-compatible". */
  id: string;
  label: string;
  capabilities: {
    structuredJson: boolean;
    translation: boolean;
  };
  generateTemplate(
    input: TemplatePromptInput,
    signal?: AbortSignal,
  ): Promise<TemplatePromptResult>;
  translate(
    input: TranslationJob,
    signal?: AbortSignal,
  ): Promise<TranslationResult>;
  /** Generate a standalone SVG mark from a prompt. Optional capability — callers
   * must fall back when a provider does not implement it. */
  generateSvg?(
    input: SvgPromptInput,
    signal?: AbortSignal,
  ): Promise<SvgPromptResult>;
}
