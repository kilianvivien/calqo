import type {
  AIProvider,
  AIProviderDiagnostics,
  SvgPromptInput,
  SvgPromptResult,
  TemplatePromptInput,
  TemplatePromptResult,
  TranslationJob,
  TranslationResult,
} from './AIProvider';
import { buildSvgPrompt, buildTemplatePrompt, buildTranslationPrompt } from './prompts';
import { parseTranslationResponse } from './openAICompatibleProvider';

export interface GeminiProviderConfig {
  apiKey?: string;
  model: string;
  label?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT = 45_000;

const STRING = { type: 'STRING' };
const NUMBER = { type: 'NUMBER' };

const TRANSLATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          layerId: STRING,
          translatedText: STRING,
        },
        required: ['layerId', 'translatedText'],
      },
    },
  },
  required: ['items'],
};

const TEMPLATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    schemaVersion: NUMBER,
    name: STRING,
    contentLocales: { type: 'ARRAY', items: STRING },
    activeContentLocale: STRING,
    palette: { type: 'ARRAY', items: STRING },
    assets: { type: 'ARRAY', items: { type: 'OBJECT' } },
    glossary: { type: 'ARRAY', items: { type: 'OBJECT' } },
    artboards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: STRING,
          preset: STRING,
          width: NUMBER,
          height: NUMBER,
          background: { type: 'OBJECT' },
          layers: {
            type: 'ARRAY',
            items: { type: 'OBJECT' },
          },
        },
        required: ['name', 'preset', 'width', 'height', 'background', 'layers'],
      },
    },
  },
  required: ['name', 'contentLocales', 'activeContentLocale', 'artboards'],
};

function extractText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text ?? '').join('').trim();
  if (text) return text;
  const blocked = data.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini blocked the request: ${blocked}.`);
  const finishReason = data.candidates?.[0]?.finishReason;
  throw new Error(
    finishReason
      ? `Gemini returned no text (finish reason: ${finishReason}).`
      : 'Gemini returned no text.',
  );
}

function modelPath(model: string): string {
  const normalized = model.replace(/^models\//, '');
  return `models/${encodeURIComponent(normalized)}`;
}

/** Provider-specific Google Gemini/GenAI adapter using generateContent. */
export function createGeminiProvider(config: GeminiProviderConfig): AIProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
  const diagnostics: AIProviderDiagnostics = {
    providerId: 'gemini',
    providerLabel: config.label ?? 'Google Gemini',
    modelId: config.model,
    timeoutMs,
  };

  async function generate(
    system: string,
    user: string,
    signal?: AbortSignal,
    responseSchema?: unknown,
  ): Promise<string> {
    if (!config.apiKey) {
      throw new Error('Gemini API key is missing.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(`${baseUrl}/${modelPath(config.model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.35,
            ...(responseSchema
              ? {
                  responseMimeType: 'application/json',
                  responseSchema,
                }
              : {}),
          },
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `Gemini responded ${response.status} ${response.statusText}: ${text.slice(0, 240)}`,
        );
      }
      return extractText(JSON.parse(text) as GeminiResponse);
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Gemini timed out after ${timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    id: 'gemini',
    label: config.label ?? 'Google Gemini',
    capabilities: { structuredJson: true, translation: true },

    async generateTemplate(
      input: TemplatePromptInput,
      signal?: AbortSignal,
    ): Promise<TemplatePromptResult> {
      const { system, user } = buildTemplatePrompt(input);
      const raw = await generate(system, user, signal, TEMPLATE_SCHEMA);
      return { raw, diagnostics: { ...diagnostics, rawOutput: raw } };
    },

    async translate(
      job: TranslationJob,
      signal?: AbortSignal,
    ): Promise<TranslationResult> {
      const { system, user } = buildTranslationPrompt(job);
      const raw = await generate(system, user, signal, TRANSLATION_SCHEMA);
      return parseTranslationResponse(raw, job, diagnostics);
    },

    async generateSvg(
      input: SvgPromptInput,
      signal?: AbortSignal,
    ): Promise<SvgPromptResult> {
      const { system, user } = buildSvgPrompt(input);
      const raw = await generate(system, user, signal);
      return { raw, diagnostics: { ...diagnostics, rawOutput: raw } };
    },
  };
}
