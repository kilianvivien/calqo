import { appleFm } from '@/lib/adapters';
import type { AIProvider } from './AIProvider';
import { stripReasoning } from './completion';
import { createCompletionProvider } from './completionProvider';

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
        throw new Error(`Apple Intelligence timed out after ${timeoutMs}ms.`, {
          cause: error,
        });
      }
      if (message.includes('APPLE_FM_UNREACHABLE')) {
        throw new Error('Apple Intelligence is not reachable on this Mac.', {
          cause: error,
        });
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  return createCompletionProvider({
    id: 'apple',
    label,
    modelId: model,
    // The on-device model has a small context window and no image input, so it
    // gets the compact schema summary.
    capabilities: {
      structuredJson: true,
      translation: true,
      vision: false,
      promptProfile: 'compact',
    },
    async complete(request) {
      const text = await chat(
        [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        request.signal,
      );
      return { text: stripReasoning(text) || text, downgrades: [] };
    },
  });
}
