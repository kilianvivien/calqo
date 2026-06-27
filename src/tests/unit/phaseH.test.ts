import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiProvider } from '@/editor/ai/geminiProvider';
import type { AIProvider, TranslationJob } from '@/editor/ai/AIProvider';
import { generateTemplate } from '@/editor/ai/promptTemplateService';
import { reconcileTranslation } from '@/editor/ai/translationService';
import {
  checkTemplateQuality,
  validateTemplateResponse,
} from '@/editor/ai/validation';
import { generateSvgMark } from '@/editor/ai/svgService';
import { normalizeAiSettings, PROVIDER_PRESETS } from '@/editor/ai/aiSettings';
import { getProvider } from '@/editor/ai/providerRegistry';
import {
  CALQO_AGENT_SKILL_CONTENT,
  CLAUDE_AGENT_SKILL_FILENAME,
} from '@/editor/ai/agentSkillFile';
import { createDefaultProject } from '@/lib/schema';

function geminiResponse(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  };
}

const templateRequest = {
  prompt: 'A calm launch card',
  preset: 'ig-square' as const,
  locale: 'en',
};

describe('phase H — Gemini provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses Gemini generateContent with structured JSON for templates', async () => {
    const project = createDefaultProject();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(geminiResponse(JSON.stringify(project)))),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGeminiProvider({
      apiKey: 'key',
      model: 'gemini-2.0-flash',
    });
    const result = await provider.generateTemplate({
      prompt: 'launch',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      locale: 'en',
      maxLayers: 20,
      fonts: ['Inter'],
    });

    expect(result.raw).toContain(project.name);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goog-api-key': 'key' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeDefined();
  });

  it('surfaces Gemini error payloads with provider context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('{"error":{"message":"bad schema"}}'),
      }),
    );
    const provider = createGeminiProvider({
      apiKey: 'key',
      model: 'gemini-2.0-flash',
    });

    await expect(
      provider.generateTemplate({
        prompt: 'launch',
        preset: 'ig-square',
        width: 1080,
        height: 1080,
        locale: 'en',
        maxLayers: 20,
        fonts: ['Inter'],
      }),
    ).rejects.toThrow(/Gemini responded 400/);
  });
});

describe('phase H — template repair and quality checks', () => {
  it('retries prompt-a-template once with repair context', async () => {
    const project = createDefaultProject();
    const provider: AIProvider = {
      id: 'test',
      label: 'Test',
      capabilities: { structuredJson: true, translation: true },
      generateTemplate: vi
        .fn()
        .mockResolvedValueOnce({ raw: '```json\n{ "artboards": [ }\n```' })
        .mockResolvedValueOnce({ raw: JSON.stringify(project) }),
      translate: vi.fn(),
    };

    const result = await generateTemplate(provider, templateRequest);

    expect(result.ok).toBe(true);
    expect(provider.generateTemplate).toHaveBeenCalledTimes(2);
    const retryInput = vi.mocked(provider.generateTemplate).mock.calls[1][0];
    expect(retryInput.repair?.error).toMatch(/JSON parse failed/);
  });

  it('normalizes common AI shorthand before strict project validation', () => {
    const validation = validateTemplateResponse(
      JSON.stringify({
        name: 'Launch card',
        artboards: [
          {
            name: 'Main',
            width: 1080,
            height: 1080,
            background: '#F7FAFC',
            layers: [
              {
                type: 'text',
                name: 'Headline',
                x: 80,
                y: 96,
                width: 920,
                height: 160,
                text: 'Launch soon',
                style: { color: '#111827', fontSize: 72 },
              },
              {
                type: 'shape',
                name: 'Badge',
                shape: 'circle',
                x: 80,
                y: 320,
                width: 200,
                height: 200,
                fill: '#0A2540',
              },
            ],
          },
        ],
      }),
      {
        prompt: 'launch',
        preset: 'ig-square',
        width: 1080,
        height: 1080,
        locale: 'en',
        maxLayers: 20,
        fonts: ['Inter'],
      },
    );

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.project.artboards[0].background).toEqual({
      type: 'solid',
      color: '#F7FAFC',
    });
    expect(validation.project.artboards[0].layers[0]).toMatchObject({
      type: 'text',
      w: 920,
      h: 160,
      text: { en: 'Launch soon' },
    });
    expect(validation.project.artboards[0].layers[1]).toMatchObject({
      type: 'shape',
      shape: 'ellipse',
      fill: { type: 'solid', color: '#0A2540' },
    });
  });

  it('warns for out-of-bounds geometry and low text contrast', () => {
    const project = createDefaultProject();
    project.artboards[0].background = { type: 'solid', color: '#FFFFFF' };
    project.artboards[0].layers.push({
      id: 'layer_1',
      name: 'White text',
      type: 'text',
      x: -10,
      y: 0,
      w: 200,
      h: 80,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: { en: 'Low contrast' },
      style: {
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 700,
        fontStyle: 'normal' as const,
        textDecoration: 'none' as const,
        color: '#FFFFFF',
        align: 'left',
        lineHeight: 1.1,
        letterSpacing: 0,
      },
    });

    const quality = checkTemplateQuality(project, {
      prompt: 'test',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      locale: 'en',
      maxLayers: 20,
      fonts: ['Inter'],
    });

    expect(quality.warnings.some((warning) => warning.includes('outside'))).toBe(true);
    expect(quality.warnings.some((warning) => warning.includes('contrast'))).toBe(true);
  });

  it('rejects external asset references from AI output', () => {
    const project = createDefaultProject();
    project.assets.push({
      id: 'asset_1',
      kind: 'raster',
      name: 'External',
      mimeType: 'image/png',
      storageKey: 'https://example.com/image.png',
      createdAt: new Date().toISOString(),
    });

    const validation = validateTemplateResponse(
      JSON.stringify(project),
      {
        prompt: 'test',
        preset: 'ig-square',
        width: 1080,
        height: 1080,
        locale: 'en',
        maxLayers: 20,
        fonts: ['Inter'],
      },
    );

    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues?.join('\n')).toMatch(/external asset/i);
  });
});

describe('phase H — translation and SVG hardening', () => {
  it('keeps every requested translation layer when provider output is partial', () => {
    const job: TranslationJob = {
      sourceLocale: 'en',
      targetLocale: 'fr',
      glossary: [],
      items: [
        { layerId: 'a', artboardId: 'ab', sourceText: 'Hello' },
        { layerId: 'b', artboardId: 'ab', sourceText: 'Sale' },
      ],
    };

    const result = reconcileTranslation(job, {
      targetLocale: 'fr',
      items: [{ layerId: 'a', artboardId: 'ab', translatedText: 'Bonjour' }],
    });

    expect(result.result.items).toHaveLength(2);
    expect(result.result.items[1].translatedText).toBe('Sale');
    expect(result.missingLayerIds).toEqual(['b']);
  });

  it('rejects unsafe AI SVG output before sanitising', async () => {
    const provider: AIProvider = {
      id: 'svg-test',
      label: 'SVG Test',
      capabilities: { structuredJson: false, translation: false },
      generateTemplate: vi.fn(),
      translate: vi.fn(),
      generateSvg: vi.fn().mockResolvedValue({
        raw: '<svg onload="evil()"><script>alert(1)</script></svg>',
      }),
    };

    const result = await generateSvgMark(provider, { prompt: 'unsafe' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.raw).toContain('<script>');
  });

  it('falls back to a bundled SVG when the provider times out', async () => {
    const provider: AIProvider = {
      id: 'svg-timeout',
      label: 'SVG Timeout',
      capabilities: { structuredJson: false, translation: false },
      generateTemplate: vi.fn(),
      translate: vi.fn(),
      generateSvg: vi.fn().mockRejectedValue(new Error('Gemini timed out after 45000ms.')),
    };

    const result = await generateSvgMark(provider, {
      prompt: 'sale badge',
      color: '#0A2540',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBe(true);
    expect(result.warning).toMatch(/timed out/i);
    expect(result.svg).toContain('#0A2540');
  });
});

describe('phase H — provider settings', () => {
  it('uses the requested hosted provider default models', () => {
    expect(PROVIDER_PRESETS.gemini.defaultModel).toBe('gemini-3.5-flash');
    expect(PROVIDER_PRESETS.mistral.defaultModel).toBe('mistral-medium-latest');
  });

  it('normalizes Gemini to the official GenAI endpoint and registry adapter', () => {
    const settings = normalizeAiSettings({
      providerId: 'gemini',
      providers: {
        gemini: {
          model: 'gemini-2.0-flash',
          apiKey: 'key',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        },
      } as never,
    });

    expect(PROVIDER_PRESETS.gemini.baseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    );
    expect(getProvider(settings)?.id).toBe('gemini');
  });

  it('migrates stale hosted default models without overwriting custom models', () => {
    const settings = normalizeAiSettings({
      providers: {
        gemini: {
          model: 'gemini-2.0-flash',
          apiKey: '',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        },
        mistral: {
          model: 'mistral-small-latest',
          apiKey: '',
          baseUrl: 'https://api.mistral.ai/v1',
        },
        custom: {
          model: 'my-custom-model',
          apiKey: '',
          baseUrl: 'https://example.com/v1',
        },
      } as never,
    });

    expect(settings.providers.gemini.model).toBe('gemini-3.5-flash');
    expect(settings.providers.mistral.model).toBe('mistral-medium-latest');
    expect(settings.providers.custom.model).toBe('my-custom-model');
  });
});

describe('phase H — downloadable agent skill', () => {
  it('bundles a SKILL.md guide for generating editable .calqo files', () => {
    expect(CALQO_AGENT_SKILL_CONTENT).toContain('name: calqo-project-maker');
    expect(CALQO_AGENT_SKILL_CONTENT).toContain('"kind": "calqo.project"');
    expect(CALQO_AGENT_SKILL_CONTENT).toContain('"formatVersion": 1');
    expect(CALQO_AGENT_SKILL_CONTENT).toContain('Text must be Calqo text layers');
    expect(CALQO_AGENT_SKILL_CONTENT).toContain('writeFileSync("generated-design.calqo"');
  });

  it('exposes the Claude .skill package filename', () => {
    expect(CLAUDE_AGENT_SKILL_FILENAME).toBe('calqo-project-maker.skill');
  });
});
