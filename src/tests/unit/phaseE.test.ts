import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addContentLocale,
  applyTranslationResult,
  createTextLayer,
  removeContentLocale,
  setActiveContentLocale,
  updateTextForLocale,
} from '@/editor/commands/projectCommands';
import { createDefaultProject, glossaryEntrySchema, type TextLayer } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { mockProvider } from '@/editor/ai/mockProvider';
import { repairJsonLikeResponse, normalizeTemplateDocument } from '@/editor/ai/validation';
import { generateTemplate, buildTemplateInput } from '@/editor/ai/promptTemplateService';
import { runTranslation, reconcileTranslation } from '@/editor/ai/translationService';
import { resolveText } from '@/editor/i18n-content/contentLocaleService';
import {
  extractTranslationItems,
  overflowStateFromMeasurement,
} from '@/editor/i18n-content/translationPipeline';
import type { TranslationJob } from '@/editor/ai/AIProvider';

function seedProject(populate?: (project: ReturnType<typeof createDefaultProject>) => void) {
  const project = createDefaultProject();
  populate?.(project);
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  return project;
}

function live(projectId: string) {
  return projectStore.getState().projects[projectId];
}

describe('phase E — schema + validation helpers', () => {
  it('defaults a glossary entry mode to do-not-translate', () => {
    const parsed = glossaryEntrySchema.parse({ source: 'Calqo' });
    expect(parsed.mode).toBe('do-not-translate');
  });

  it('repairs fenced and prose-wrapped JSON, errors on garbage', () => {
    expect(repairJsonLikeResponse('```json\n{"a":1}\n```').value).toEqual({ a: 1 });
    expect(repairJsonLikeResponse('Sure! {"a":2} done').value).toEqual({ a: 2 });
    expect(repairJsonLikeResponse('no json here').error).toBeTruthy();
  });

  it('normalizes a bare document by filling the envelope and minting ids', () => {
    const input = buildTemplateInput({
      prompt: 'test',
      preset: 'story',
      locale: 'fr',
    });
    const normalized = normalizeTemplateDocument(
      {
        artboards: [
          {
            background: { type: 'solid', color: '#000' },
            layers: [{ type: 'text', name: 'T', x: 0, y: 0, w: 10, h: 10, text: { fr: 'Hi' }, style: { fontFamily: 'Inter', fontSize: 10, fontWeight: 400, color: '#fff', align: 'left', lineHeight: 1, letterSpacing: 0 } }],
          },
        ],
      },
      input,
    ) as Record<string, unknown>;
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.activeContentLocale).toBe('fr');
    const ab = (normalized.artboards as Record<string, unknown>[])[0];
    expect(typeof ab.id).toBe('string');
    expect(ab.width).toBe(1080);
    expect(ab.height).toBe(1920);
    const layer = (ab.layers as Record<string, unknown>[])[0];
    expect(typeof layer.id).toBe('string');
  });
});

describe('phase E — prompt-a-template (mock provider)', () => {
  it('generates a valid, editable project from a prompt', async () => {
    const validation = await generateTemplate(mockProvider, {
      prompt: 'A bold sale poster',
      preset: 'ig-portrait',
      locale: 'fr',
      palette: ['#0A2540', '#FFFFFF', '#E8B339'],
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const { project } = validation;
    expect(project.activeContentLocale).toBe('fr');
    expect(project.artboards[0].width).toBe(1080);
    expect(project.artboards[0].height).toBe(1350);
    expect(project.artboards[0].layers.length).toBeGreaterThan(0);
  });

  it('surfaces validation failure with the raw output for repair', async () => {
    const validation = await generateTemplate(mockProvider, {
      prompt: '__invalid__ make it break',
      preset: 'ig-square',
      locale: 'en',
    });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.raw).toContain('schemaVersion');
  });
});

describe('phase E — translation pipeline', () => {
  it('extracts text items across artboards, skipping empty layers', () => {
    const project = seedProject((p) => {
      const a = createTextLayer(p, 0, 0) as TextLayer;
      a.text = { en: 'Hello' };
      const b = createTextLayer(p, 0, 0) as TextLayer;
      b.text = { en: '   ' }; // whitespace only — skipped
      p.artboards[0].layers.push(a, b);
    });
    const items = extractTranslationItems(project, 'en', 'active', project.artboards[0].id);
    expect(items).toHaveLength(1);
    expect(items[0].sourceText).toBe('Hello');
  });

  it('mock-translates dictionary words and respects do-not-translate glossary', async () => {
    const project = seedProject((p) => {
      const layer = createTextLayer(p, 0, 0) as TextLayer;
      layer.text = { en: 'Hello' };
      p.artboards[0].layers.push(layer);
    });

    const plain = await runTranslation(mockProvider, project, {
      sourceLocale: 'en',
      targetLocale: 'fr',
      scope: 'active',
      activeArtboardId: project.artboards[0].id,
    });
    expect(plain.result.items[0].translatedText).toBe('Bonjour');

    const withGlossary = await runTranslation(
      mockProvider,
      { ...project, glossary: [{ source: 'Hello', mode: 'do-not-translate' }] },
      {
        sourceLocale: 'en',
        targetLocale: 'fr',
        scope: 'active',
        activeArtboardId: project.artboards[0].id,
      },
    );
    expect(withGlossary.result.items[0].translatedText).toContain('Hello');
    expect(withGlossary.result.items[0].translatedText).not.toContain('Bonjour');
  });

  it('reconciles by dropping items for unknown layers', () => {
    const job: TranslationJob = {
      sourceLocale: 'en',
      targetLocale: 'fr',
      glossary: [],
      items: [{ layerId: 'layer_1', artboardId: 'ab_1', sourceText: 'Hi' }],
    };
    const { result, accepted } = reconcileTranslation(job, {
      targetLocale: 'fr',
      items: [
        { layerId: 'layer_1', artboardId: 'ab_1', translatedText: 'Salut' },
        { layerId: 'ghost', artboardId: 'ab_1', translatedText: 'Nope' },
      ],
    });
    expect(accepted).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].layerId).toBe('layer_1');
  });

  it('derives overflow state from measured dimensions', () => {
    const layer = { w: 100, h: 50 } as TextLayer;
    expect(overflowStateFromMeasurement(layer, { width: 80, height: 40 }, 'en')).toBeUndefined();
    expect(
      overflowStateFromMeasurement(layer, { width: 80, height: 90 }, 'en')?.suggestedAction,
    ).toBe('reduce-font');
    expect(
      overflowStateFromMeasurement(layer, { width: 140, height: 40 }, 'en')?.suggestedAction,
    ).toBe('increase-box');
  });
});

describe('phase E — content locale commands', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
  });

  it('adds a locale, copying text from the source and switching active', () => {
    const project = seedProject((p) => {
      const layer = createTextLayer(p, 0, 0) as TextLayer;
      layer.text = { en: 'Hello' };
      p.artboards[0].layers.push(layer);
    });

    addContentLocale(project.id, 'fr', { copyFrom: 'en' });

    const next = live(project.id);
    expect(next.contentLocales).toContain('fr');
    expect(next.activeContentLocale).toBe('fr');
    const layer = next.artboards[0].layers[0] as TextLayer;
    expect(layer.text.fr).toBe('Hello');
  });

  it('removes a locale and its text, reassigning the active locale', () => {
    const project = seedProject((p) => {
      p.contentLocales = ['en', 'fr'];
      p.activeContentLocale = 'fr';
      const layer = createTextLayer(p, 0, 0) as TextLayer;
      layer.text = { en: 'Hello', fr: 'Bonjour' };
      p.artboards[0].layers.push(layer);
    });

    removeContentLocale(project.id, 'fr');

    const next = live(project.id);
    expect(next.contentLocales).toEqual(['en']);
    expect(next.activeContentLocale).toBe('en');
    expect((next.artboards[0].layers[0] as TextLayer).text.fr).toBeUndefined();
  });

  it('sets text for a specific locale only', () => {
    const project = seedProject((p) => {
      p.contentLocales = ['en', 'fr'];
      const layer = createTextLayer(p, 0, 0) as TextLayer;
      layer.text = { en: 'Hello' };
      p.artboards[0].layers.push(layer);
    });
    const layerId = project.artboards[0].layers[0].id;

    updateTextForLocale(project.id, layerId, 'fr', 'Bonjour');

    const layer = live(project.id).artboards[0].layers[0] as TextLayer;
    expect(layer.text.en).toBe('Hello');
    expect(layer.text.fr).toBe('Bonjour');
  });

  it('applies a translation result without touching the source locale', () => {
    const project = seedProject((p) => {
      const layer = createTextLayer(p, 0, 0) as TextLayer;
      layer.text = { en: 'Hello' };
      p.artboards[0].layers.push(layer);
    });
    const layerId = project.artboards[0].layers[0].id;
    const artboardId = project.artboards[0].id;

    setActiveContentLocale(project.id, 'en');
    applyTranslationResult(project.id, {
      targetLocale: 'fr',
      items: [{ layerId, artboardId, translatedText: 'Bonjour' }],
    });

    const next = live(project.id);
    expect(next.contentLocales).toContain('fr');
    const layer = next.artboards[0].layers[0] as TextLayer;
    expect(layer.text.en).toBe('Hello');
    expect(layer.text.fr).toBe('Bonjour');
  });
});

describe('phase E — text fallback', () => {
  it('falls back to the primary locale when the active one is missing', () => {
    const layer = { text: { en: 'Hello' } } as unknown as TextLayer;
    const resolved = resolveText(layer, {
      activeContentLocale: 'fr',
      contentLocales: ['en', 'fr'],
    });
    expect(resolved.value).toBe('Hello');
    expect(resolved.isFallback).toBe(true);
    expect(resolved.fromLocale).toBe('en');
  });
});
