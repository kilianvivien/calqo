import type Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AiModelInfo } from './AIProvider';
import {
  createDeadline,
  type CompletionRequest,
  type CompletionResult,
} from './completion';
import { createCompletionProvider } from './completionProvider';

export interface AnthropicProviderConfig {
  apiKey?: string;
  model: string;
  label?: string;
  /** Idle timeout override in ms (time allowed without receiving an event). */
  timeoutMs?: number;
}

/** Room for adaptive thinking plus a full project JSON, while staying inside
 * the output cap of every model a user is likely to pick. */
const MAX_TOKENS = 32_000;

/** Models whose safety classifiers can decline a request and that accept the
 * server-side `fallbacks: "default"` retry on the Claude API. */
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type SdkModule = typeof import('@anthropic-ai/sdk');

let sdkPromise: Promise<SdkModule> | null = null;
/** The SDK is only needed once someone picks Claude, so keep it out of the
 * main bundle. */
function loadSdk(): Promise<SdkModule> {
  sdkPromise ??= import('@anthropic-ai/sdk');
  return sdkPromise;
}

/** Official Anthropic Messages adapter. Calqo is local-first with no backend,
 * so the user's own key is used directly from the app, like the other
 * providers. */
export function createAnthropicProvider(
  config: AnthropicProviderConfig,
): AIProvider {
  const label = config.label ?? 'Anthropic Claude';

  async function client(): Promise<{ sdk: SdkModule; anthropic: Anthropic }> {
    if (!config.apiKey) throw new Error('Anthropic API key is missing.');
    const sdk = await loadSdk();
    return {
      sdk,
      anthropic: new sdk.default({
        apiKey: config.apiKey,
        dangerouslyAllowBrowser: true,
      }),
    };
  }

  function describe(sdk: SdkModule, error: unknown): unknown {
    const { APIError, AuthenticationError, RateLimitError } = sdk.default;
    if (error instanceof AuthenticationError) {
      return new Error('Claude rejected the API key.');
    }
    if (error instanceof RateLimitError) {
      return new Error('Claude rate limit reached. Try again shortly.');
    }
    if (error instanceof APIError && error.status) {
      return new Error(
        `Claude responded ${error.status}: ${error.message.slice(0, 240)}`,
      );
    }
    return error;
  }

  async function complete(
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    const { sdk, anthropic } = await client();
    const deadline = createDeadline(request.signal, config.timeoutMs);
    const params = {
      model: config.model,
      max_tokens: MAX_TOKENS,
      system: request.system,
      messages: [
        {
          role: 'user',
          content: [
            ...(request.images ?? []).map((image) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: image.mimeType,
                data: image.data,
              },
            })),
            { type: 'text' as const, text: request.user },
          ],
        },
      ],
    } satisfies Anthropic.MessageStreamParams;
    try {
      const options = { signal: deadline.signal };
      const stream = FALLBACK_MODELS.test(config.model)
        ? anthropic.beta.messages.stream(
            { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' },
            options,
          )
        : anthropic.messages.stream(params, options);

      let received = 0;
      for await (const event of stream) {
        deadline.touch();
        if (event.type !== 'content_block_delta') continue;
        if (event.delta.type === 'text_delta')
          received += event.delta.text.length;
        request.onProgress?.({
          receivedChars: received,
          reasoning: received === 0,
        });
      }
      const message = await stream.finalMessage();
      if (message.stop_reason === 'refusal') {
        throw new Error('Claude declined this request.');
      }
      let text = '';
      for (const block of message.content) {
        if (block.type === 'text') text += block.text;
      }
      if (!text.trim()) throw new Error('Claude returned no text.');
      return {
        text,
        downgrades:
          message.stop_reason === 'max_tokens'
            ? ['Claude reached its output limit; the reply may be cut short.']
            : [],
      };
    } catch (error) {
      const timeout = deadline.timeoutError('Claude');
      if (timeout) throw timeout;
      throw describe(sdk, error);
    } finally {
      deadline.dispose();
    }
  }

  async function listModels(signal?: AbortSignal): Promise<AiModelInfo[]> {
    const { sdk, anthropic } = await client();
    try {
      const models: AiModelInfo[] = [];
      for await (const model of anthropic.models.list(
        { limit: 100 },
        { signal },
      )) {
        models.push({ id: model.id, label: model.display_name, vision: true });
      }
      return models;
    } catch (error) {
      throw describe(sdk, error);
    }
  }

  return createCompletionProvider({
    id: 'anthropic',
    label,
    modelId: config.model,
    // JSON is requested through the prompt and validated by Calqo; the project
    // shape is too open-ended for strict constrained decoding.
    capabilities: { structuredJson: true, translation: true, vision: true },
    complete,
    listModels,
  });
}
