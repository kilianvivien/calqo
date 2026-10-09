import type { AIProvider, AiModelInfo } from './AIProvider';
import {
  createDeadline,
  imageToDataUrl,
  readSseData,
  stripReasoning,
  type CompletionRequest,
  type CompletionResult,
} from './completion';
import { createCompletionProvider } from './completionProvider';

export { parseTranslationResponse } from './translationResponse';

export interface OpenAICompatibleConfig {
  /** Base URL of an OpenAI-compatible API, e.g. http://localhost:11434/v1
   * (Ollama) or https://api.openai.com/v1. */
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Display label for the resolved provider. */
  label?: string;
  providerId?: string;
  /** Omit `temperature` up front for APIs whose current models reject it. */
  omitTemperature?: boolean;
  /** Idle timeout override in ms (time allowed without receiving a byte). */
  timeoutMs?: number;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface ChatMessage {
  role: 'system' | 'user';
  content: string | ContentPart[];
}

/** What a request currently asks of the endpoint. Each rejected attempt drops
 * one capability so older or stricter backends still answer. */
interface Attempt {
  format: 'schema' | 'object' | 'none';
  images: boolean;
  temperature: boolean;
  stream: boolean;
}

class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
    readonly detail: string,
  ) {
    super(`Provider responded ${status} ${statusText}: ${detail.slice(0, 200)}`);
    this.name = 'ProviderHttpError';
  }
}

const DOWNGRADE_NOTES = {
  schema: 'The endpoint rejected a JSON schema; plain JSON mode was used.',
  object: 'The endpoint rejected JSON mode; the reply was parsed from text.',
  images: 'The model rejected image input; the reference image was not sent.',
  temperature: 'The model rejected a custom temperature; its default was used.',
  stream: 'The endpoint rejected streaming; the reply was fetched in one piece.',
} as const;

/** Decide what to give up after a client-error response, preferring the
 * capability the error message names. Returns null when nothing is left. */
function nextAttempt(
  attempt: Attempt,
  error: ProviderHttpError,
): { attempt: Attempt; note: string } | null {
  const detail = error.detail.toLowerCase();
  const steps: {
    applies: boolean;
    hint: RegExp;
    next: Attempt;
    note: string;
  }[] = [
    {
      applies: attempt.format === 'schema',
      hint: /json_schema|response_format|schema|structured/,
      next: { ...attempt, format: 'object' },
      note: DOWNGRADE_NOTES.schema,
    },
    {
      applies: attempt.images,
      hint: /image|vision|multimodal|modalit/,
      next: { ...attempt, images: false },
      note: DOWNGRADE_NOTES.images,
    },
    {
      applies: attempt.temperature,
      hint: /temperature/,
      next: { ...attempt, temperature: false },
      note: DOWNGRADE_NOTES.temperature,
    },
    {
      applies: attempt.format === 'object',
      hint: /json_object|response_format|json mode/,
      next: { ...attempt, format: 'none' },
      note: DOWNGRADE_NOTES.object,
    },
    {
      applies: attempt.stream,
      hint: /stream/,
      next: { ...attempt, stream: false },
      note: DOWNGRADE_NOTES.stream,
    },
  ];
  const available = steps.filter((step) => step.applies);
  const named = available.find((step) => step.hint.test(detail));
  // A 404 is normally a wrong model or URL; only retry it when the message
  // points at a capability (some routers answer 404 for "no vision endpoint").
  const step = named ?? (error.status === 404 ? undefined : available[0]);
  return step ? { attempt: step.next, note: step.note } : null;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) =>
      part && typeof part === 'object' && (part as { type?: unknown }).type === 'text'
        ? String((part as { text?: unknown }).text ?? '')
        : '',
    )
    .join('');
}

function hasReasoning(delta: Record<string, unknown> | undefined): boolean {
  if (!delta) return false;
  if (delta.reasoning_content || delta.reasoning) return true;
  return (
    Array.isArray(delta.content) &&
    delta.content.some(
      (part) =>
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type !== 'text',
    )
  );
}

/** A single OpenAI-style /chat/completions implementation that also covers
 * Ollama and other local endpoints by varying the base URL (plan §14.2, §14.6).
 * Lives entirely behind the AIProvider interface so the editor never depends on
 * a specific backend. */
export function createOpenAICompatibleProvider(
  config: OpenAICompatibleConfig,
): AIProvider {
  const providerId = config.providerId ?? 'openai-compatible';
  const label = config.label ?? 'OpenAI-compatible endpoint';
  const base = config.baseUrl.replace(/\/+$/, '');
  const authHeaders: Record<string, string> = config.apiKey
    ? { Authorization: `Bearer ${config.apiKey}` }
    : {};

  async function send(request: CompletionRequest, attempt: Attempt): Promise<string> {
    const images = attempt.images ? (request.images ?? []) : [];
    const messages: ChatMessage[] = [
      { role: 'system', content: request.system },
      {
        role: 'user',
        content:
          images.length > 0
            ? [
                { type: 'text', text: request.user },
                ...images.map(
                  (image): ContentPart => ({
                    type: 'image_url',
                    image_url: { url: imageToDataUrl(image) },
                  }),
                ),
              ]
            : request.user,
      },
    ];
    const responseFormat =
      attempt.format === 'schema' && request.schema
        ? {
            type: 'json_schema',
            json_schema: {
              name: request.schema.name,
              schema: request.schema.schema,
              strict: false,
            },
          }
        : attempt.format === 'none'
          ? undefined
          : { type: 'json_object' };

    const deadline = createDeadline(request.signal, config.timeoutMs);
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          model: config.model,
          messages,
          ...(attempt.temperature ? { temperature: 0.4 } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...(attempt.stream ? { stream: true } : {}),
        }),
        signal: deadline.signal,
      });
      deadline.touch();
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new ProviderHttpError(response.status, response.statusText, detail);
      }

      const contentType = response.headers?.get?.('content-type') ?? '';
      if (!contentType.includes('text/event-stream') || !response.body) {
        const data = (await response.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        return textOf(data.choices?.[0]?.message?.content);
      }

      let text = '';
      for await (const data of readSseData(response.body, deadline.touch)) {
        if (data === '[DONE]') break;
        let chunk: {
          choices?: { delta?: Record<string, unknown> }[];
          error?: { message?: string };
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) {
          throw new Error(`Provider stream failed: ${chunk.error.message ?? 'unknown error'}`);
        }
        const delta = chunk.choices?.[0]?.delta;
        const piece = textOf(delta?.content);
        if (piece) text += piece;
        if (piece || hasReasoning(delta)) {
          request.onProgress?.({
            receivedChars: text.length,
            reasoning: text.length === 0,
          });
        }
      }
      return text;
    } catch (error) {
      const timeout = deadline.timeoutError(label);
      if (timeout) throw timeout;
      throw error;
    } finally {
      deadline.dispose();
    }
  }

  async function complete(request: CompletionRequest): Promise<CompletionResult> {
    let attempt: Attempt = {
      format:
        request.format === 'text' ? 'none' : request.schema ? 'schema' : 'object',
      images: (request.images?.length ?? 0) > 0,
      temperature: !config.omitTemperature,
      stream: true,
    };
    const downgrades: string[] = [];
    for (;;) {
      try {
        const text = stripReasoning(await send(request, attempt));
        if (!text) throw new Error('Provider returned no message content.');
        return { text, downgrades };
      } catch (error) {
        if (
          !(error instanceof ProviderHttpError) ||
          ![400, 404, 415, 422, 501].includes(error.status)
        ) {
          throw error;
        }
        const next = nextAttempt(attempt, error);
        if (!next) throw error;
        attempt = next.attempt;
        downgrades.push(next.note);
      }
    }
  }

  async function listModels(signal?: AbortSignal): Promise<AiModelInfo[]> {
    const response = await fetch(`${base}/models`, {
      headers: authHeaders,
      signal,
    });
    if (!response.ok) {
      throw new Error(`Provider responded ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as {
      data?: {
        id?: unknown;
        name?: unknown;
        architecture?: { input_modalities?: unknown };
        pricing?: { prompt?: unknown; completion?: unknown };
      }[];
    };
    const models: AiModelInfo[] = [];
    for (const entry of data.data ?? []) {
      if (typeof entry.id !== 'string' || !entry.id) continue;
      const modalities = entry.architecture?.input_modalities;
      const pricing = entry.pricing;
      models.push({
        id: entry.id,
        label: typeof entry.name === 'string' ? entry.name : undefined,
        vision: Array.isArray(modalities) ? modalities.includes('image') : undefined,
        free: pricing
          ? Number(pricing.prompt) === 0 && Number(pricing.completion) === 0
          : undefined,
      });
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  }

  return createCompletionProvider({
    id: providerId,
    label,
    modelId: config.model,
    // Image input is attempted optimistically and dropped if the model
    // rejects it, so any endpoint may turn out to be vision-capable.
    capabilities: { structuredJson: true, translation: true, vision: true },
    complete,
    listModels,
  });
}
