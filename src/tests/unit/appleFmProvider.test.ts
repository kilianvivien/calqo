import { afterEach, describe, expect, it, vi } from 'vitest';

const adapterMocks = vi.hoisted(() => ({
  appleFm: {
    preflight: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    status: vi.fn(),
    countTokens: vi.fn(),
    chat: vi.fn(),
    cancelChat: vi.fn(),
  },
  appSettings: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

import { createAppleFmProvider } from '@/editor/ai/appleFmProvider';
import {
  isAiEnabled,
  normalizeAiSettings,
  PROVIDER_PRESETS,
} from '@/editor/ai/aiSettings';
import { appleFmStore } from '@/editor/ai/appleFmStore';
import { getProvider } from '@/editor/ai/providerRegistry';
import { createDefaultProject } from '@/lib/schema';

describe('Apple Intelligence AFM 3 provider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    appleFmStore.setState({
      preflight: null,
      status: { running: false, port: null, managed: false, error: null },
      pending: false,
      error: null,
    });
  });

  it('uses the native proxy with AFM-compatible request options', async () => {
    const project = createDefaultProject();
    adapterMocks.appleFm.chat.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(project) } }],
      }),
      retryAfter: null,
    });
    const provider = createAppleFmProvider({
      baseUrl: 'http://127.0.0.1:1976/v1',
    });

    const result = await provider.generateTemplate({
      prompt: 'A local launch card',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      locale: 'en',
      maxLayers: 20,
      fonts: ['Inter'],
    });

    expect(result.raw).toContain(project.name);
    const request = adapterMocks.appleFm.chat.mock.calls[0][0];
    expect(request.url).toBe('http://127.0.0.1:1976/v1/chat/completions');
    expect(request.payload).toMatchObject({
      model: 'system',
      stream: false,
      max_tokens: 8192,
    });
    expect(request.payload).not.toHaveProperty('response_format');
  });

  it('accepts AFM typed text chunks', async () => {
    adapterMocks.appleFm.chat.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: [
                { type: 'reasoning', text: 'hidden' },
                { type: 'text', text: '<svg viewBox="0 0 10 10" />' },
              ],
            },
          },
        ],
      }),
      retryAfter: null,
    });

    const result = await createAppleFmProvider({
      baseUrl: 'http://127.0.0.1:1976/v1',
    }).generateSvg?.({ prompt: 'a circle' });

    expect(result?.raw).toBe('<svg viewBox="0 0 10 10" />');
  });

  it('registers Apple as an on-device, keyless system model', () => {
    expect(PROVIDER_PRESETS.apple).toMatchObject({
      defaultModel: 'system',
      needsKey: false,
      desktopOnly: true,
    });
    appleFmStore.setState({
      status: { running: true, port: 43121, managed: true, error: null },
    });
    const settings = normalizeAiSettings({
      providerId: 'apple',
      providers: {
        apple: {
          model: 'system',
          apiKey: '',
          baseUrl: 'http://127.0.0.1:43121/v1',
          enabled: true,
        },
      } as never,
    });

    expect(getProvider(settings)?.id).toBe('apple');
    expect(isAiEnabled(settings)).toBe(true);
  });

  it('keeps Apple selected but unavailable while its switch is off', () => {
    const settings = normalizeAiSettings({ providerId: 'apple' });

    expect(settings.providers.apple.enabled).toBe(false);
    expect(isAiEnabled(settings)).toBe(false);
    expect(getProvider(settings)).toBeNull();
  });
});
