import { appleFm } from '@/lib/adapters';
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
import { parseTranslationResponse } from './openAICompatibleProvider';
import {
  buildSvgPrompt,
  buildTemplatePrompt,
  buildTranslationPrompt,
} from './prompts';

export interface AppleFmProviderConfig {
  baseUrl: string;
  model?: string;
  label?: string;
  timeoutMs?: number;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

const DEFAULT_TIMEOUT = 120_000;

function requestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `afm-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function extractContent(body: string): string {
  const data = JSON.parse(body) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .filter(
        (chunk): chunk is { type: 'text'; text: string } =>
          typeof chunk === 'object' &&
          chunk !== null &&
          (chunk as { type?: unknown }).type === 'text' &&
          typeof (chunk as { text?: unknown }).text === 'string',
      )
      .map((chunk) => chunk.text)
      .join('');
    if (text.trim()) return text;
  }
  throw new Error('Apple Intelligence returned no usable message content.');
}

/** Apple Foundation Models speaks OpenAI chat completions, but its loopback
 * server rejects WebView Origin/Sec-Fetch headers. Requests therefore use the
 * narrow native proxy owned by the Apple FM adapter. */
export function createAppleFmProvider(
  config: AppleFmProviderConfig,
): AIProvider {
  const model = config.model ?? 'system';
  const label = config.label ?? 'Apple Intelligence (AFM 3)';
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
  const diagnostics: AIProviderDiagnostics = {
    providerId: 'apple',
    providerLabel: label,
    modelId: model,
    timeoutMs,
  };

  async function chat(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<string> {
    const id = requestId();
    const abort = () => void appleFm.cancelChat(id).catch(() => undefined);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const response = await appleFm.chat({
        requestId: id,
        url: endpoint,
        timeoutMs,
        payload: {
          model,
          messages,
          temperature: 0.4,
          max_tokens: 8192,
          // AFM streams when this field is omitted and rejects json_object.
          stream: false,
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Apple Intelligence responded ${response.status}: ${response.body.slice(0, 200)}`,
        );
      }
      return extractContent(response.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('APPLE_FM_CANCELLED') || signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (message.includes('APPLE_FM_TIMEOUT')) {
        throw new Error(`Apple Intelligence timed out after ${timeoutMs}ms.`);
      }
      if (message.includes('APPLE_FM_UNREACHABLE')) {
        throw new Error('Apple Intelligence is not reachable on this Mac.');
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  return {
    id: 'apple',
    label,
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
      return { raw, diagnostics: { ...diagnostics, rawOutput: raw } };
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
      );
      return { raw, diagnostics: { ...diagnostics, rawOutput: raw } };
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
      return parseTranslationResponse(raw, job, diagnostics);
    },
  };
}
