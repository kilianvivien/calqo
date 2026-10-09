import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleProvider } from '@/editor/ai/openAICompatibleProvider';
import { createGeminiProvider } from '@/editor/ai/geminiProvider';
import { createAnthropicProvider } from '@/editor/ai/anthropicProvider';
import {
  imageFromDataUrl,
  stripReasoning,
  type CompletionRequest,
} from '@/editor/ai/completion';
import { toGeminiSchema } from '@/editor/ai/outputSchemas';
import { buildTemplatePrompt } from '@/editor/ai/prompts';
import {
  checkTemplateQuality,
  validateTemplateResponse,
} from '@/editor/ai/validation';
import { normalizeAiSettings, PROVIDER_PRESETS } from '@/editor/ai/aiSettings';
import { getProvider } from '@/editor/ai/providerRegistry';
import type { TemplatePromptInput } from '@/editor/ai/AIProvider';

const anthropicMocks = vi.hoisted(() => ({
  stream: vi.fn(),
  betaStream: vi.fn(),
  list: vi.fn(),
  options: [] as unknown[],
}));

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status?: number;
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static RateLimitError = RateLimitError;
    messages = { stream: anthropicMocks.stream };
    beta = { messages: { stream: anthropicMocks.betaStream } };
    models = { list: anthropicMocks.list };
    constructor(options: unknown) {
      anthropicMocks.options.push(options);
    }
  }
  return { default: Anthropic };
});

const IMAGE = { mimeType: 'image/png' as const, data: 'AAAA' };

const templateInput: TemplatePromptInput = {
  prompt: 'launch',
  preset: 'ig-square',
  width: 1080,
  height: 1080,
  locale: 'en',
  maxLayers: 20,
  fonts: ['Inter'],
};

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // Split mid-event to prove the reader buffers across chunks.
      const payload = events.map((event) => `data: ${event}\n\n`).join('');
      const middle = Math.floor(payload.length / 2);
      controller.enqueue(encoder.encode(payload.slice(0, middle)));
      controller.enqueue(encoder.encode(payload.slice(middle)));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function chunk(delta: Record<string, unknown>): string {
  return JSON.stringify({ choices: [{ delta }] });
}

function jsonResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), { status });
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

function request(
  overrides: Partial<CompletionRequest> = {},
): CompletionRequest {
  return { system: 'sys', user: 'hello', format: 'json', ...overrides };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('completion helpers', () => {
  it('strips inline reasoning blocks from model output', () => {
    expect(stripReasoning('<think>plan</think>{"a":1}')).toBe('{"a":1}');
    expect(stripReasoning('<think>never closed')).toBe('');
    expect(stripReasoning('plain')).toBe('plain');
  });

  it('accepts only supported raster data URLs as images', () => {
    expect(imageFromDataUrl('data:image/jpeg;base64,QUJD')).toEqual({
      mimeType: 'image/jpeg',
      data: 'QUJD',
    });
    expect(imageFromDataUrl('data:image/svg+xml;base64,QUJD')).toBeNull();
    expect(imageFromDataUrl('https://example.com/a.png')).toBeNull();
  });

  it('converts JSON Schema types to Gemini upper-case types', () => {
    expect(
      toGeminiSchema({
        type: 'object',
        properties: { items: { type: 'array', items: { type: 'string' } } },
        required: ['items'],
      }),
    ).toEqual({
      type: 'OBJECT',
      properties: { items: { type: 'ARRAY', items: { type: 'STRING' } } },
      required: ['items'],
    });
  });
});

describe('OpenAI-compatible provider', () => {
  it('streams the answer, reports progress and ignores reasoning', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          chunk({ reasoning_content: 'let me think' }),
          chunk({ content: '<think>hidden</think>' }),
          chunk({ content: '{"ok":' }),
          chunk({ content: 'true}' }),
          '[DONE]',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const onProgress = vi.fn();

    const provider = createOpenAICompatibleProvider({
      baseUrl: 'http://localhost:11434/v1/',
      model: 'gemma4',
    });
    const result = await provider.complete!(request({ onProgress }));

    expect(result.text).toBe('{"ok":true}');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
    expect(bodyOf(fetchMock)).toMatchObject({
      model: 'gemma4',
      stream: true,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    expect(onProgress).toHaveBeenCalledWith({
      receivedChars: 0,
      reasoning: true,
    });
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ reasoning: false }),
    );
  });

  it('still reads endpoints that answer without streaming', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('{"a":1}')));
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      model: 'm',
    });
    expect((await provider.complete!(request())).text).toBe('{"a":1}');
  });

  it('sends a JSON schema and falls back to JSON mode when it is rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(400, 'json_schema is not supported'))
      .mockResolvedValueOnce(jsonResponse('{"items":[]}'));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      model: 'm',
    });
    const result = await provider.complete!(
      request({ schema: { name: 'thing', schema: { type: 'object' } } }),
    );

    expect(bodyOf(fetchMock, 0).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'thing', schema: { type: 'object' }, strict: false },
    });
    expect(bodyOf(fetchMock, 1).response_format).toEqual({
      type: 'json_object',
    });
    expect(result.downgrades).toHaveLength(1);
  });

  it('drops the capability the error names: images, then temperature', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(404, 'No endpoints support image input'),
      )
      .mockResolvedValueOnce(
        errorResponse(
          400,
          "Unsupported value: 'temperature' does not support 0.4",
        ),
      )
      .mockResolvedValueOnce(jsonResponse('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      model: 'm',
    });
    const result = await provider.complete!(request({ images: [IMAGE] }));

    expect(bodyOf(fetchMock, 0).messages[1].content).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
    expect(bodyOf(fetchMock, 1).messages[1].content).toBe('hello');
    expect(bodyOf(fetchMock, 1)).toHaveProperty('temperature');
    expect(bodyOf(fetchMock, 2)).not.toHaveProperty('temperature');
    expect(result.downgrades).toHaveLength(2);
  });

  it('does not retry auth failures or an unknown model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(401, 'bad key'))
      .mockResolvedValueOnce(errorResponse(404, 'model not found'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      model: 'm',
      apiKey: 'secret',
    });

    await expect(provider.complete!(request())).rejects.toThrow(/401/);
    await expect(provider.complete!(request())).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('omits temperature for providers whose models reject it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);
    const settings = normalizeAiSettings({
      providerId: 'openai',
      providers: { openai: { apiKey: 'k' } } as never,
    });

    await getProvider(settings)!.complete!(request());

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(bodyOf(fetchMock)).not.toHaveProperty('temperature');
    expect(bodyOf(fetchMock).model).toBe(PROVIDER_PRESETS.openai.defaultModel);
  });

  it('lists models with vision and free flags from the catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'z/paid', pricing: { prompt: '0.01', completion: '0.02' } },
            {
              id: 'a/free-vision',
              name: 'Free Vision',
              architecture: { input_modalities: ['text', 'image'] },
              pricing: { prompt: '0', completion: '0' },
            },
            { name: 'no id' },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOpenAICompatibleProvider({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'm',
      apiKey: 'k',
    });

    expect(await provider.listModels!()).toEqual([
      { id: 'a/free-vision', label: 'Free Vision', vision: true, free: true },
      { id: 'z/paid', label: undefined, vision: undefined, free: false },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/models',
    );
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer k',
    });
  });
});

describe('Gemini provider', () => {
  it('sends the reference image and an upper-cased schema, skipping thoughts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: 'hmm', thought: true }] } },
          ],
        }),
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"name":"A"}' }] } }],
        }),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createGeminiProvider({
      apiKey: 'key',
      model: 'gemini-3.8-flash',
    });

    const result = await provider.generateTemplate({
      ...templateInput,
      styleReference: { image: IMAGE },
    });

    expect(result.raw).toBe('{"name":"A"}');
    const body = bodyOf(fetchMock);
    expect(body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'AAAA' },
    });
    expect(body.generationConfig.responseSchema.type).toBe('OBJECT');
    expect(body.systemInstruction.parts[0].text).toContain(
      'A reference image is attached',
    );
  });

  it('retries without the schema when Gemini rejects it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"Invalid response schema"}}', {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"name":"A"}' }] } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createGeminiProvider({ apiKey: 'key', model: 'm' });

    const result = await provider.generateTemplate(templateInput);

    expect(bodyOf(fetchMock, 1).generationConfig).not.toHaveProperty(
      'responseSchema',
    );
    expect(result.diagnostics?.warnings).toHaveLength(1);
  });

  it('lists only text-generation models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/gemini-3.8-flash',
                displayName: 'Gemini 3.8 Flash',
                supportedGenerationMethods: ['generateContent'],
              },
              {
                name: 'models/text-embedding-005',
                supportedGenerationMethods: ['embedContent'],
              },
              {
                name: 'models/gemini-3.8-flash-tts',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = createGeminiProvider({ apiKey: 'key', model: 'm' });
    expect(await provider.listModels!()).toEqual([
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', vision: true },
    ]);
  });
});

describe('Anthropic provider', () => {
  function fakeStream(text: string, stopReason = 'end_turn') {
    return {
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta' },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text },
        };
      },
      finalMessage: async () => ({
        stop_reason: stopReason,
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text },
        ],
      }),
    };
  }

  beforeEach(() => {
    anthropicMocks.stream.mockReset();
    anthropicMocks.betaStream.mockReset();
    anthropicMocks.options.length = 0;
  });

  it('uses the default model with server-side refusal fallbacks', async () => {
    anthropicMocks.betaStream.mockReturnValue(fakeStream('{"ok":true}'));
    const settings = normalizeAiSettings({
      providerId: 'anthropic',
      providers: { anthropic: { apiKey: 'sk-ant-test' } } as never,
    });
    const provider = getProvider(settings)!;
    const onProgress = vi.fn();

    const result = await provider.complete!(
      request({ images: [IMAGE], onProgress }),
    );

    expect(result.text).toBe('{"ok":true}');
    expect(anthropicMocks.options[0]).toMatchObject({
      apiKey: 'sk-ant-test',
      dangerouslyAllowBrowser: true,
    });
    const params = anthropicMocks.betaStream.mock.calls[0][0];
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'sys',
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
    // Current Claude models reject sampling parameters and manual budgets.
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
    expect(params.messages[0].content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
      },
      { type: 'text', text: 'hello' },
    ]);
    expect(onProgress).toHaveBeenCalledWith({
      receivedChars: 0,
      reasoning: true,
    });
    expect(anthropicMocks.stream).not.toHaveBeenCalled();
  });

  it('skips the fallback beta for models that do not take it', async () => {
    anthropicMocks.stream.mockReturnValue(fakeStream('hi'));
    const provider = createAnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-4-5',
    });

    await provider.complete!(request({ format: 'text' }));

    expect(anthropicMocks.betaStream).not.toHaveBeenCalled();
    expect(anthropicMocks.stream.mock.calls[0][0]).not.toHaveProperty(
      'fallbacks',
    );
  });

  it('reports a refusal instead of returning partial content', async () => {
    anthropicMocks.stream.mockReturnValue(fakeStream('partial', 'refusal'));
    const provider = createAnthropicProvider({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
    });
    await expect(provider.complete!(request())).rejects.toThrow(/declined/);
  });

  it('needs a key before it loads anything', async () => {
    const provider = createAnthropicProvider({ model: 'claude-opus-5-5' });
    await expect(provider.complete!(request())).rejects.toThrow(
      /key is missing/,
    );
  });
});

describe('provider presets', () => {
  it('ships working defaults and migrates retired ones', () => {
    expect(PROVIDER_PRESETS.anthropic.defaultModel).toBe('claude-opus-5-5');
    expect(PROVIDER_PRESETS.openrouter.defaultModel).toBe('openrouter/free');
    const settings = normalizeAiSettings({
      providers: {
        openrouter: {
          model: 'google/gemini-2.0-flash-exp:free',
          apiKey: '',
          baseUrl: '',
        },
        local: {
          model: 'llama3.1',
          apiKey: '',
          baseUrl: 'http://localhost:11434/v1',
        },
        gemini: { model: 'gemini-3.5-flash', apiKey: '', baseUrl: '' },
      } as never,
    });
    expect(settings.providers.openrouter.model).toBe('openrouter/free');
    expect(settings.providers.local.model).toBe(
      PROVIDER_PRESETS.local.defaultModel,
    );
    expect(settings.providers.gemini.model).toBe('gemini-3.8-flash');
  });
});

describe('template prompt and validation', () => {
  it('describes gradients and groups to capable models only', () => {
    const full = buildTemplatePrompt(templateInput).system;
    const compact = buildTemplatePrompt({
      ...templateInput,
      detail: 'compact',
    }).system;
    expect(full).toContain('"type":"linear"');
    expect(full).toContain('group:');
    expect(full).toContain('Design quality:');
    expect(compact).not.toContain('"type":"linear"');
    expect(compact).not.toContain('Design quality:');
  });

  it('never claims a link can be opened', () => {
    const { system } = buildTemplatePrompt({
      ...templateInput,
      styleReference: { url: 'https://example.com/brand' },
    });
    expect(system).toContain('You cannot open links');
    expect(system).not.toContain('A reference image is attached');
  });

  it('accepts gradient shorthand and plain-string copy from the model', () => {
    const raw = JSON.stringify({
      name: 'Gradient card',
      artboards: [
        {
          name: 'Post',
          width: 1080,
          height: 1080,
          background: {
            type: 'gradient',
            colors: ['#0F172A', '#1E3A8A'],
          },
          layers: [
            {
              type: 'shape',
              name: 'Glow',
              x: 100,
              y: 100,
              w: 400,
              h: 400,
              shape: 'circle',
              fill: {
                type: 'radial',
                stops: [
                  { position: 100, color: '#1E3A8A' },
                  { position: 0, color: '#60A5FA' },
                ],
              },
            },
            {
              type: 'group',
              name: 'Badge',
              x: 80,
              y: 800,
              w: 400,
              h: 120,
              children: [
                {
                  type: 'text',
                  name: 'Label',
                  x: 0,
                  y: 0,
                  w: 400,
                  h: 120,
                  text: 'Bonjour',
                  style: { color: '#FFFFFF', fontSize: 64 },
                },
              ],
            },
          ],
        },
      ],
    });

    const validation = validateTemplateResponse(raw, {
      ...templateInput,
      locale: 'fr',
    });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const artboard = validation.project.artboards[0];
    expect(artboard.background).toEqual({
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#0F172A' },
        { offset: 1, color: '#1E3A8A' },
      ],
    });
    const glow = artboard.layers[0];
    expect(glow.type === 'shape' && glow.fill).toEqual({
      type: 'radial',
      stops: [
        { offset: 0, color: '#60A5FA' },
        { offset: 1, color: '#1E3A8A' },
      ],
    });
    const badge = artboard.layers[1];
    expect(badge.type === 'group' && badge.children[0]).toMatchObject({
      type: 'text',
      text: { fr: 'Bonjour' },
    });
    expect(validation.warnings).toEqual([]);
  });

  it('judges text contrast against the worst gradient stop', () => {
    const raw = JSON.stringify({
      name: 'Low contrast',
      artboards: [
        {
          name: 'Post',
          width: 1080,
          height: 1080,
          background: {
            type: 'linear',
            stops: [
              { offset: 0, color: '#000000' },
              { offset: 1, color: '#FFFFFF' },
            ],
          },
          layers: [
            {
              type: 'text',
              name: 'Headline',
              x: 80,
              y: 80,
              w: 600,
              h: 120,
              text: 'Hi',
              style: { color: '#FFFFFF' },
            },
          ],
        },
      ],
    });
    const validation = validateTemplateResponse(raw, templateInput);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(
      checkTemplateQuality(validation.project, templateInput).warnings,
    ).toEqual([
      'Headline: text contrast is low against the artboard background.',
    ]);
  });

  it('keeps provider downgrade notes alongside quality warnings', () => {
    const raw = JSON.stringify({
      name: 'Card',
      artboards: [
        {
          name: 'Post',
          width: 1080,
          height: 1080,
          background: '#FFFFFF',
          layers: [],
        },
      ],
    });
    const validation = validateTemplateResponse(raw, templateInput, {
      providerId: 'custom',
      warnings: [
        'The model rejected image input; the reference image was not sent.',
      ],
    });
    expect(validation.ok && validation.warnings).toEqual([
      'The model rejected image input; the reference image was not sent.',
    ]);
  });
});
