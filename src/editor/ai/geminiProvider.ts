import type { AIProvider, AiModelInfo } from './AIProvider';
import {
  createDeadline,
  readSseData,
  stripReasoning,
  type CompletionRequest,
  type CompletionResult,
} from './completion';
import { createCompletionProvider } from './completionProvider';
import { toGeminiSchema } from './outputSchemas';

export interface GeminiProviderConfig {
  apiKey?: string;
  model: string;
  label?: string;
  baseUrl?: string;
  /** Idle timeout override in ms (time allowed without receiving a byte). */
  timeoutMs?: number;
}

interface GeminiPart {
  text?: string;
  /** Set on thought-summary parts, which are not part of the answer. */
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function modelPath(model: string): string {
  const normalized = model.replace(/^models\//, '');
  return `models/${encodeURIComponent(normalized)}`;
}

function answerText(chunk: GeminiResponse): string {
  return (chunk.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');
}

/** Provider-specific Google Gemini/GenAI adapter using streamGenerateContent. */
export function createGeminiProvider(config: GeminiProviderConfig): AIProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const label = config.label ?? 'Google Gemini';

  async function send(
    request: CompletionRequest,
    withSchema: boolean,
  ): Promise<string> {
    if (!config.apiKey) {
      throw new Error('Gemini API key is missing.');
    }
    const deadline = createDeadline(request.signal, config.timeoutMs);
    try {
      const response = await fetch(
        `${baseUrl}/${modelPath(config.model)}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [
              {
                role: 'user',
                parts: [
                  ...(request.images ?? []).map((image) => ({
                    inlineData: { mimeType: image.mimeType, data: image.data },
                  })),
                  { text: request.user },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.35,
              ...(request.format === 'json'
                ? {
                    responseMimeType: 'application/json',
                    ...(withSchema && request.schema
                      ? { responseSchema: toGeminiSchema(request.schema.schema) }
                      : {}),
                  }
                : {}),
            },
          }),
          signal: deadline.signal,
        },
      );
      deadline.touch();
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new GeminiHttpError(response.status, response.statusText, detail);
      }

      let text = '';
      let last: GeminiResponse = {};
      const consume = (chunk: GeminiResponse) => {
        if (chunk.error) {
          throw new Error(`Gemini stream failed: ${chunk.error.message ?? 'unknown error'}`);
        }
        last = { ...last, ...chunk };
        const piece = answerText(chunk);
        text += piece;
        request.onProgress?.({
          receivedChars: text.length,
          reasoning: text.length === 0,
        });
      };

      const contentType = response.headers?.get?.('content-type') ?? '';
      if (contentType.includes('text/event-stream') && response.body) {
        for await (const data of readSseData(response.body, deadline.touch)) {
          try {
            consume(JSON.parse(data) as GeminiResponse);
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
        }
      } else {
        // Non-streaming reply (proxies, test doubles): one object or an array.
        const parsed = JSON.parse(await response.text()) as
          | GeminiResponse
          | GeminiResponse[];
        for (const chunk of Array.isArray(parsed) ? parsed : [parsed]) consume(chunk);
      }

      if (text.trim()) return text;
      const blocked = last.promptFeedback?.blockReason;
      if (blocked) throw new Error(`Gemini blocked the request: ${blocked}.`);
      const finishReason = last.candidates?.[0]?.finishReason;
      throw new Error(
        finishReason
          ? `Gemini returned no text (finish reason: ${finishReason}).`
          : 'Gemini returned no text.',
      );
    } catch (error) {
      const timeout = deadline.timeoutError('Gemini');
      if (timeout) throw timeout;
      throw error;
    } finally {
      deadline.dispose();
    }
  }

  async function complete(request: CompletionRequest): Promise<CompletionResult> {
    const downgrades: string[] = [];
    let text: string;
    try {
      text = await send(request, true);
    } catch (error) {
      // A schema the model rejects should not cost the whole request.
      if (
        !(error instanceof GeminiHttpError) ||
        error.status !== 400 ||
        !request.schema ||
        !/schema/i.test(error.detail)
      ) {
        throw error;
      }
      downgrades.push('Gemini rejected the response schema; plain JSON mode was used.');
      text = await send(request, false);
    }
    return { text: stripReasoning(text), downgrades };
  }

  async function listModels(signal?: AbortSignal): Promise<AiModelInfo[]> {
    if (!config.apiKey) throw new Error('Gemini API key is missing.');
    const response = await fetch(`${baseUrl}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': config.apiKey },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Gemini responded ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as {
      models?: {
        name?: unknown;
        displayName?: unknown;
        supportedGenerationMethods?: unknown;
      }[];
    };
    const models: AiModelInfo[] = [];
    for (const entry of data.models ?? []) {
      if (typeof entry.name !== 'string') continue;
      const methods = entry.supportedGenerationMethods;
      if (Array.isArray(methods) && !methods.includes('generateContent')) continue;
      const id = entry.name.replace(/^models\//, '');
      // Embedding, image, audio and video models cannot draft a design.
      if (/embedding|imagen|veo|tts|audio|image|aqa/i.test(id)) continue;
      models.push({
        id,
        label: typeof entry.displayName === 'string' ? entry.displayName : undefined,
        vision: true,
      });
    }
    return models.sort((a, b) => b.id.localeCompare(a.id));
  }

  return createCompletionProvider({
    id: 'gemini',
    label,
    modelId: config.model,
    capabilities: { structuredJson: true, translation: true, vision: true },
    complete,
    listModels,
  });
}

class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
    readonly detail: string,
  ) {
    super(`Gemini responded ${status} ${statusText}: ${detail.slice(0, 240)}`);
    this.name = 'GeminiHttpError';
  }
}
