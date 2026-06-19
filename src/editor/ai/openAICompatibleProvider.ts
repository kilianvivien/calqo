import type {
  AIProvider,
  SvgPromptInput,
  SvgPromptResult,
  TemplatePromptInput,
  TemplatePromptResult,
  TranslationJob,
  TranslationResult,
} from './AIProvider';
import { buildSvgPrompt, buildTemplatePrompt, buildTranslationPrompt } from './prompts';
import { repairJsonLikeResponse } from './validation';

export interface OpenAICompatibleConfig {
  /** Base URL of an OpenAI-compatible API, e.g. http://localhost:11434/v1
   * (Ollama) or https://api.openai.com/v1. */
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Display label for the resolved provider. */
  label?: string;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const DEFAULT_TIMEOUT = 45_000;

/** A single OpenAI-style /chat/completions implementation that also covers
 * Ollama and other local endpoints by varying the base URL (plan §14.2, §14.6).
 * Lives entirely behind the AIProvider interface so the editor never depends on
 * a specific backend. */
export function createOpenAICompatibleProvider(
  config: OpenAICompatibleConfig,
): AIProvider {
  async function chat(
    messages: ChatMessage[],
    signal?: AbortSignal,
    jsonMode = true,
  ): Promise<string> {
    const base = config.baseUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeoutMs ?? DEFAULT_TIMEOUT,
    );
    // Chain the caller's abort signal into our timeout controller.
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.4,
          // Ask for JSON where the backend supports it; ignored otherwise.
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `Provider responded ${response.status} ${response.statusText}: ${detail.slice(0, 200)}`,
        );
      }
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Provider returned no message content.');
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    id: 'openai-compatible',
    label: config.label ?? 'OpenAI-compatible endpoint',
    capabilities: { structuredJson: true, translation: true },

    async generateTemplate(
      input: TemplatePromptInput,
      signal?: AbortSignal,
    ): Promise<TemplatePromptResult> {
      const { system, user } = buildTemplatePrompt(input);
      const raw = await chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        signal,
      );
      return { raw };
    },

    async generateSvg(
      input: SvgPromptInput,
      signal?: AbortSignal,
    ): Promise<SvgPromptResult> {
      const { system, user } = buildSvgPrompt(input);
      const raw = await chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        signal,
        false,
      );
      return { raw };
    },

    async translate(
      job: TranslationJob,
      signal?: AbortSignal,
    ): Promise<TranslationResult> {
      const { system, user } = buildTranslationPrompt(job);
      const raw = await chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        signal,
      );
      const repaired = repairJsonLikeResponse(raw);
      const parsed = repaired.value as
        | { items?: { layerId?: string; translatedText?: string }[] }
        | undefined;
      const byLayer = new Map<string, string>();
      for (const item of parsed?.items ?? []) {
        if (typeof item.layerId === 'string' && typeof item.translatedText === 'string') {
          byLayer.set(item.layerId, item.translatedText);
        }
      }
      // Map back onto the requested items; fall back to source text so a partial
      // response never drops a layer (the service flags unchanged entries).
      return {
        targetLocale: job.targetLocale,
        items: job.items.map((item) => ({
          layerId: item.layerId,
          artboardId: item.artboardId,
          translatedText: byLayer.get(item.layerId) ?? item.sourceText,
        })),
      };
    },
  };
}
