import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, TranslationJob } from '@/editor/ai/AIProvider';
import type { CompletionRequest } from '@/editor/ai/completion';
import { rewriteLayerCopy } from '@/editor/ai/copyService';
import {
  describeArtboardForEdit,
  editDesign,
  normalizeDesignEditOperations,
} from '@/editor/ai/designEditService';
import {
  runTranslation,
  runTranslations,
  TRANSLATION_CHUNK_SIZE,
} from '@/editor/ai/translationService';
import {
  applyTranslationResults,
  editProject,
  undoProject,
} from '@/editor/commands/projectCommands';
import {
  createDefaultProject,
  safeImportProject,
  type CalqoLayer,
  type CalqoProject,
} from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';

const pipelineMocks = vi.hoisted(() => ({
  /** Texts longer than this many characters count as overflowing. */
  maxChars: Number.POSITIVE_INFINITY,
}));

// jsdom cannot measure text, so stand in a length-based rule for overflow.
vi.mock('@/editor/i18n-content/translationPipeline', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/editor/i18n-content/translationPipeline')
    >();
  return {
    ...actual,
    detectTextOverflow: (
      layer: { text: Record<string, string> },
      locale: string,
    ) =>
      (layer.text[locale] ?? '').length > pipelineMocks.maxChars
        ? {
            hasOverflow: true,
            measuredAtLocale: locale,
            suggestedAction: 'reduce-font',
          }
        : undefined,
  };
});

type TextLayer = Extract<CalqoLayer, { type: 'text' }>;

function openProject(): CalqoProject {
  const base = createDefaultProject({ name: 'Edit test' });
  const imported = safeImportProject({
    ...base,
    artboards: [
      {
        ...base.artboards[0],
        layers: [
          {
            id: 'panel',
            name: 'Panel',
            type: 'shape',
            shape: 'rect',
            x: 0,
            y: 0,
            w: 400,
            h: 200,
            fill: { type: 'solid', color: '#E8B339' },
          },
          {
            id: 'headline',
            name: 'Headline',
            type: 'text',
            x: 40,
            y: 40,
            w: 400,
            h: 120,
            text: { en: 'Hello', fr: 'Bonjour' },
            style: { fontSize: 48 },
          },
          {
            id: 'legal',
            name: 'Legal',
            type: 'text',
            x: 40,
            y: 900,
            w: 400,
            h: 60,
            locked: true,
            text: { en: 'Terms apply' },
            style: {},
          },
          {
            id: 'points',
            name: 'Points',
            type: 'list',
            x: 40,
            y: 300,
            w: 400,
            h: 200,
            items: [
              { id: 'row-a', text: { en: 'One', fr: 'Un' } },
              { id: 'row-b', text: { en: 'Two', fr: 'Deux' } },
            ],
            marker: { kind: 'bullet', color: '#111827' },
            style: {},
          },
        ],
      },
    ],
  });
  if (!imported.ok) throw new Error(imported.error);
  const project = imported.project;
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  return project;
}

function current(id: string): CalqoProject {
  return projectStore.getState().projects[id];
}

function layerOf(project: CalqoProject, id: string): CalqoLayer {
  const layer = project.artboards[0].layers.find(
    (candidate) => candidate.id === id,
  );
  if (!layer) throw new Error(`missing layer ${id}`);
  return layer;
}

/** A provider whose `complete` replays scripted answers and records requests. */
function scriptedProvider(answers: unknown[]) {
  const requests: CompletionRequest[] = [];
  const provider: AIProvider = {
    id: 'test',
    label: 'Test',
    modelId: 'test-model',
    capabilities: { structuredJson: true, translation: true, vision: true },
    generateTemplate: vi.fn(),
    translate: vi.fn(),
    complete: vi.fn(async (request: CompletionRequest) => {
      requests.push(request);
      const answer = answers.shift();
      return {
        text: typeof answer === 'string' ? answer : JSON.stringify(answer),
        downgrades: [],
      };
    }),
  };
  return { provider, requests };
}

beforeEach(() => {
  pipelineMocks.maxChars = Number.POSITIVE_INFINITY;
});

afterEach(() => {
  projectStore.setState({ projects: {} });
  historyStore.setState({ histories: {} });
  vi.restoreAllMocks();
});

describe('design edit — describing the artboard', () => {
  it('shows the model plain copy for the active locale and flags locked layers', () => {
    const project = openProject();
    const described = describeArtboardForEdit(project.artboards[0], 'fr') as {
      layers: Record<string, unknown>[];
    };
    expect(described.layers.map((layer) => layer.id)).toEqual([
      'panel',
      'headline',
      'legal',
      'points',
    ]);
    expect(described.layers[1]).toMatchObject({ text: 'Bonjour' });
    expect(described.layers[2]).toMatchObject({ locked: true });
    expect(described.layers[3]).toMatchObject({ items: ['Un', 'Deux'] });
    expect(described.layers[0]).not.toHaveProperty('locked');
  });
});

describe('design edit — normalizing model operations', () => {
  it('expands shorthand into strict operations', () => {
    const project = openProject();
    const { operations, issues } = normalizeDesignEditOperations(
      [
        {
          type: 'updateLayer',
          layerId: 'headline',
          patch: {
            id: 'headline',
            type: 'text',
            text: 'Big news',
            fontSize: 96,
          },
        },
        { type: 'updateLayer', layerId: 'panel', patch: { fill: '#112233' } },
        {
          type: 'updateLayer',
          layerId: 'points',
          patch: { items: ['Uno', 'Dos', 'Tres'] },
        },
        { type: 'deleteLayers', layerId: 'panel' },
        { type: 'setArtboardBackground', background: '#000000' },
      ],
      project.artboards[0],
      'en',
      ['Inter'],
    );

    expect(issues).toEqual([]);
    expect(operations[0]).toEqual({
      type: 'updateLayer',
      layerId: 'headline',
      patch: { text: { en: 'Big news' }, style: { fontSize: 96 } },
    });
    expect(operations[1]).toMatchObject({
      patch: { fill: { type: 'solid', color: '#112233' } },
    });
    const items = (
      operations[2] as {
        patch: { items: { id: string; text: Record<string, string> }[] };
      }
    ).patch.items;
    // Existing rows keep their id and their other locales.
    expect(items[0]).toEqual({ id: 'row-a', text: { en: 'Uno', fr: 'Un' } });
    expect(items[2].text).toEqual({ en: 'Tres' });
    expect(operations[3]).toEqual({
      type: 'deleteLayers',
      layerIds: ['panel'],
    });
    expect(operations[4]).toEqual({
      type: 'setArtboardBackground',
      background: { type: 'solid', color: '#000000' },
    });
  });

  it('leaves locked layers alone and refuses what the assistant may not do', () => {
    const project = openProject();
    const { operations, issues, warnings } = normalizeDesignEditOperations(
      [
        { type: 'updateLayer', layerId: 'legal', patch: { text: 'Changed' } },
        { type: 'deleteLayers', layerIds: ['legal', 'panel'] },
        {
          type: 'addLayer',
          layer: { type: 'image', name: 'Photo', x: 0, y: 0, w: 10, h: 10 },
        },
        { type: 'setClipFps', fps: 60 },
      ],
      project.artboards[0],
      'en',
      ['Inter'],
    );

    expect(operations).toEqual([{ type: 'deleteLayers', layerIds: ['panel'] }]);
    expect(warnings).toHaveLength(2);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/image and svg layers cannot be created/);
    expect(issues[1]).toMatch(/"setClipFps" is not available/);
  });
});

describe('design edit — end to end', () => {
  it('applies the model answer as one undoable step', async () => {
    const project = openProject();
    const { provider, requests } = scriptedProvider([
      {
        summary: 'Headline enlarged and a badge added.',
        operations: [
          {
            type: 'updateLayer',
            layerId: 'headline',
            patch: { text: 'Big launch', style: { fontSize: 96 } },
          },
          {
            type: 'addLayer',
            layer: {
              type: 'shape',
              name: 'Badge',
              shape: 'circle',
              x: 800,
              y: 60,
              w: 200,
              h: 200,
              fill: {
                type: 'linear',
                stops: [
                  { offset: 0, color: '#F97316' },
                  { offset: 1, color: '#DC2626' },
                ],
              },
            },
          },
        ],
      },
    ]);

    const outcome = await editDesign(provider, project, {
      instruction: 'Make it pop',
      projectId: project.id,
      artboardId: project.artboards[0].id,
      selectedLayerIds: ['headline'],
      preview: { mimeType: 'image/png', data: 'AAAA' },
    });

    expect(outcome).toMatchObject({
      ok: true,
      changed: true,
      summary: 'Headline enlarged and a badge added.',
    });
    const after = current(project.id);
    const headline = layerOf(after, 'headline') as TextLayer;
    expect(headline.text).toEqual({ en: 'Big launch', fr: 'Bonjour' });
    expect(headline.style.fontSize).toBe(96);
    expect(after.artboards[0].layers).toHaveLength(5);
    expect(after.artboards[0].layers[4]).toMatchObject({
      name: 'Badge',
      shape: 'ellipse',
      fill: { type: 'linear', angle: 90 },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].images).toHaveLength(1);
    expect(requests[0].system).toContain(
      'A rendering of the current artboard is attached',
    );
    expect(JSON.parse(requests[0].user)).toMatchObject({
      request: 'Make it pop',
      selectedLayerIds: ['headline'],
    });

    undoProject(project.id);
    const restored = current(project.id);
    expect(restored.artboards[0].layers).toHaveLength(4);
    expect((layerOf(restored, 'headline') as TextLayer).text.en).toBe('Hello');
  });

  it('feeds validation errors back and applies the corrected answer', async () => {
    const project = openProject();
    const { provider, requests } = scriptedProvider([
      {
        summary: 'Moved.',
        operations: [
          { type: 'updateLayer', layerId: 'ghost', patch: { x: 10 } },
        ],
      },
      {
        summary: 'Moved the panel.',
        operations: [
          { type: 'updateLayer', layerId: 'panel', patch: { x: 120 } },
        ],
      },
    ]);

    const outcome = await editDesign(provider, project, {
      instruction: 'Nudge the panel',
      projectId: project.id,
      artboardId: project.artboards[0].id,
      selectedLayerIds: [],
    });

    expect(outcome).toMatchObject({ ok: true, changed: true });
    expect(outcome.ok && outcome.diagnostics.retryCount).toBe(1);
    expect(requests[1].system).toContain('Repair retry:');
    expect(requests[1].system).toContain('ghost');
    expect(layerOf(current(project.id), 'panel').x).toBe(120);
  });

  it('applies nothing when both attempts are invalid', async () => {
    const project = openProject();
    const { provider } = scriptedProvider([
      'not json at all',
      { operations: 'nope' },
    ]);

    const outcome = await editDesign(provider, project, {
      instruction: 'Do something',
      projectId: project.id,
      artboardId: project.artboards[0].id,
      selectedLayerIds: [],
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid' });
    expect(current(project.id).updatedAt).toBe(project.updatedAt);
  });

  it('refuses to apply onto a design that changed in the meantime', async () => {
    const project = openProject();
    const { provider } = scriptedProvider([
      {
        summary: 'Moved.',
        operations: [
          { type: 'updateLayer', layerId: 'panel', patch: { x: 500 } },
        ],
      },
    ]);
    (provider.complete as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => {
        // The user keeps editing while the model is thinking.
        await new Promise((resolve) => setTimeout(resolve, 5));
        editProject(project.id, (draft) => {
          draft.name = 'Renamed meanwhile';
        });
        return {
          text: JSON.stringify({
            summary: 'Moved.',
            operations: [
              { type: 'updateLayer', layerId: 'panel', patch: { x: 500 } },
            ],
          }),
          downgrades: [],
        };
      },
    );

    const outcome = await editDesign(provider, project, {
      instruction: 'Move it',
      projectId: project.id,
      artboardId: project.artboards[0].id,
      selectedLayerIds: [],
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'stale' });
    expect(layerOf(current(project.id), 'panel').x).toBe(0);
  });

  it('reports an explanation without touching the design', async () => {
    const project = openProject();
    const { provider } = scriptedProvider([
      { summary: 'I cannot add photos.', operations: [] },
    ]);
    const outcome = await editDesign(provider, project, {
      instruction: 'Add a photo of a cat',
      projectId: project.id,
      artboardId: project.artboards[0].id,
      selectedLayerIds: [],
    });
    expect(outcome).toMatchObject({
      ok: true,
      changed: false,
      summary: 'I cannot add photos.',
    });
  });

  it('does not send a preview to providers without vision', async () => {
    const project = openProject();
    const { provider, requests } = scriptedProvider([
      { summary: '', operations: [] },
    ]);
    provider.capabilities = {
      structuredJson: true,
      translation: true,
      vision: false,
    };
    await editDesign(provider, project, {
      instruction: 'x',
      projectId: project.id,
      artboardId: project.artboards[0].id,
      selectedLayerIds: [],
      preview: { mimeType: 'image/png', data: 'AAAA' },
    });
    expect(requests[0].images).toBeUndefined();
    expect(requests[0].system).not.toContain(
      'rendering of the current artboard',
    );
  });
});

describe('copy tools', () => {
  it('rewrites a layer and tightens the result when it stops fitting', async () => {
    const project = openProject();
    const layer = layerOf(project, 'headline') as TextLayer;
    pipelineMocks.maxChars = 12;
    const { provider, requests } = scriptedProvider([
      { text: 'A much longer and punchier hello' },
      { text: 'Punchy hi' },
    ]);

    const result = await rewriteLayerCopy(provider, layer, 'en', 'punchier');

    expect(result).toEqual({ ok: true, text: 'Punchy hi', overflows: false });
    expect(requests[0].system).toContain('never translate');
    expect(JSON.parse(requests[1].user)).toMatchObject({
      tooLong: 'A much longer and punchier hello',
    });
    expect(requests[1].system).toContain('Stay within 5 characters');
  });

  it('flags a rewrite that still overflows and rejects empty answers', async () => {
    const project = openProject();
    const layer = layerOf(project, 'headline') as TextLayer;
    pipelineMocks.maxChars = 6;
    const long = scriptedProvider([
      { text: 'Still far too long' },
      { text: 'Also too long' },
    ]);
    expect(
      await rewriteLayerCopy(long.provider, layer, 'en', 'rewrite'),
    ).toEqual({
      ok: true,
      text: 'Also too long',
      overflows: true,
    });

    const empty = scriptedProvider([{ text: '  ' }]);
    expect(
      await rewriteLayerCopy(empty.provider, layer, 'en', 'rewrite'),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await rewriteLayerCopy(
        empty.provider,
        { ...layer, text: {} },
        'en',
        'rewrite',
      ),
    ).toMatchObject({ ok: false });
  });
});

describe('translation runs', () => {
  function translatingProvider(
    translate: (job: TranslationJob) => Record<string, string>,
  ) {
    const jobs: TranslationJob[] = [];
    const provider: AIProvider = {
      id: 'test',
      label: 'Test',
      capabilities: { structuredJson: true, translation: true },
      generateTemplate: vi.fn(),
      translate: vi.fn(async (job: TranslationJob) => {
        jobs.push(job);
        const byId = translate(job);
        return {
          targetLocale: job.targetLocale,
          items: job.items
            .filter((item) => byId[item.layerId] !== undefined)
            .map((item) => ({
              layerId: item.layerId,
              artboardId: item.artboardId,
              translatedText: byId[item.layerId],
            })),
        };
      }),
    };
    return { provider, jobs };
  }

  it('asks again for shorter wording where a translation overflows', async () => {
    const project = openProject();
    pipelineMocks.maxChars = 14;
    const { provider, jobs } = translatingProvider((job) =>
      job.items[0].previousTranslation
        ? { headline: 'Hallo' }
        : {
            headline: 'Ein herzliches Willkommen',
            legal: 'Es gelten AGB',
            'points::row-a': 'Eins',
            'points::row-b': 'Zwei',
          },
    );

    const run = await runTranslation(provider, project, {
      sourceLocale: 'en',
      targetLocale: 'de',
      scope: 'active',
      activeArtboardId: project.artboards[0].id,
    });

    expect(jobs).toHaveLength(2);
    expect(jobs[1].items).toEqual([
      expect.objectContaining({
        layerId: 'headline',
        previousTranslation: 'Ein herzliches Willkommen',
        maxCharsHint: 5,
      }),
    ]);
    expect(run.shortened).toBe(1);
    expect(run.overflowLayerIds).toEqual([]);
    expect(
      run.result.items.find((item) => item.layerId === 'headline')
        ?.translatedText,
    ).toBe('Hallo');
  });

  it('splits large jobs into batches', async () => {
    const base = openProject();
    const count = TRANSLATION_CHUNK_SIZE + 5;
    const project: CalqoProject = {
      ...base,
      artboards: [
        {
          ...base.artboards[0],
          layers: Array.from({ length: count }, (_, index) => ({
            ...(layerOf(base, 'headline') as TextLayer),
            id: `t${index}`,
            text: { en: `Line ${index}` },
          })),
        },
      ],
    };
    const { provider, jobs } = translatingProvider((job) =>
      Object.fromEntries(
        job.items.map((item) => [item.layerId, `FR ${item.sourceText}`]),
      ),
    );

    const run = await runTranslation(provider, project, {
      sourceLocale: 'en',
      targetLocale: 'fr',
      scope: 'all',
      activeArtboardId: null,
    });

    expect(jobs.map((job) => job.items.length)).toEqual([
      TRANSLATION_CHUNK_SIZE,
      5,
    ]);
    expect(run.result.items).toHaveLength(count);
    expect(run.missingLayerIds).toEqual([]);
  });

  it('translates several locales, survives one failing, and applies in one undo step', async () => {
    const project = openProject();
    const { provider } = translatingProvider((job) => {
      if (job.targetLocale === 'es') throw new Error('rate limited');
      return Object.fromEntries(
        job.items.map((item) => [
          item.layerId,
          `${job.targetLocale}:${item.sourceText}`,
        ]),
      );
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const progress = vi.fn();

    const { runs, failedLocales } = await runTranslations(
      provider,
      project,
      {
        sourceLocale: 'en',
        targetLocales: ['de', 'es', 'it'],
        scope: 'active',
        activeArtboardId: project.artboards[0].id,
      },
      undefined,
      progress,
    );

    expect(runs.map((run) => run.result.targetLocale)).toEqual(['de', 'it']);
    expect(failedLocales).toEqual(['es']);
    expect(progress).toHaveBeenCalledTimes(3);

    applyTranslationResults(
      project.id,
      runs.map((run) => run.result),
    );
    const after = current(project.id);
    expect(after.contentLocales).toEqual(expect.arrayContaining(['de', 'it']));
    expect((layerOf(after, 'headline') as TextLayer).text).toMatchObject({
      de: 'de:Hello',
      it: 'it:Hello',
    });

    undoProject(project.id);
    const restored = current(project.id);
    expect(restored.contentLocales).not.toContain('de');
    expect(
      (layerOf(restored, 'headline') as TextLayer).text,
    ).not.toHaveProperty('it');
  });
});
