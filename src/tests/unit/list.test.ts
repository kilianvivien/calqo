import { afterEach, describe, expect, it } from 'vitest';
import {
  addContentLocale,
  addListItem,
  applyTranslationResult,
  commitListInlineEdit,
  createListLayer,
  removeContentLocale,
  removeListItem,
  reorderListItem,
  recomputeOverflow,
  setListMarker,
  updateListItemTextForLocale,
} from '@/editor/commands/projectCommands';
import {
  createDefaultProject,
  safeImportProject,
  validateProject,
  type ListLayer,
  type CalqoAssetRef,
} from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import {
  decodeListRowId,
  encodeListRowId,
  extractTranslationItems,
} from '@/editor/i18n-content/translationPipeline';
import { isListLayer } from '@/editor/utils/layers';

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

function listLayerIn(projectId: string): ListLayer {
  const layer = live(projectId).artboards[0].layers[0];
  if (!isListLayer(layer)) throw new Error('expected a list layer');
  return layer;
}

function resetStores() {
  projectStore.setState({ projects: {}, saveState: {} });
  historyStore.setState({ histories: {} });
  selectionStore.setState({
    activeArtboardId: null,
    selectedLayerIds: [],
    hoveredLayerId: null,
  });
}

afterEach(() => {
  resetStores();
});

const baseListLayer = {
  type: 'list' as const,
  name: 'List',
  x: 0,
  y: 0,
  w: 360,
  h: 200,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  marker: { kind: 'bullet' as const, color: '#111827' },
  markerGap: 8,
  style: {
    fontFamily: 'Inter',
    fontSize: 36,
    fontWeight: 500,
    color: '#111827',
    align: 'left' as const,
    lineHeight: 1.25,
    letterSpacing: 0,
  },
};

describe('list layer — schema', () => {
  it('validates a project containing a list layer', () => {
    const project = createDefaultProject();
    project.artboards[0].layers.push({
      ...baseListLayer,
      id: 'l1',
      items: [
        { id: 'r1', text: { en: 'First' } },
        { id: 'r2', text: { en: 'Second' } },
      ],
    } as ListLayer);
    expect(validateProject(project).success).toBe(true);
  });

  it('rejects a list layer with no items', () => {
    const project = createDefaultProject();
    project.artboards[0].layers.push({
      ...baseListLayer,
      id: 'l1',
      items: [],
    } as unknown as ListLayer);
    expect(validateProject(project).success).toBe(false);
  });

  it('strips unknown fields on import and keeps the list', () => {
    const project = createDefaultProject();
    project.artboards[0].layers.push({
      ...baseListLayer,
      id: 'l1',
      items: [{ id: 'r1', text: { en: 'Hi' } }],
    } as ListLayer);
    const imported = safeImportProject({
      ...structuredClone(project),
      futureField: 42,
    });
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect('futureField' in imported.project).toBe(false);
      expect(isListLayer(imported.project.artboards[0].layers[0])).toBe(true);
    }
  });

  it('accepts every marker kind', () => {
    const kinds = ['bullet', 'dash', 'arrow', 'none', 'character', 'asset'] as const;
    for (const kind of kinds) {
      const project = createDefaultProject();
      project.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        marker: { kind, color: '#111827', character: kind === 'character' ? '✦' : undefined, assetId: kind === 'asset' ? 'a1' : undefined },
        items: [{ id: 'r1', text: { en: 'Hi' } }],
      } as ListLayer);
      expect(validateProject(project).success).toBe(true);
    }
  });
});

describe('list layer — commands', () => {
  it('createListLayer seeds two rows for the active locale', () => {
    const project = seedProject();
    const layer = createListLayer(project, 10, 20) as ListLayer;
    expect(layer.type).toBe('list');
    expect(layer.items).toHaveLength(2);
    expect(layer.items[0].text[project.activeContentLocale]).toBeTruthy();
    expect(layer.marker.kind).toBe('bullet');
  });

  it('add/remove/reorder items', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [
          { id: 'r1', text: { en: 'A' } },
          { id: 'r2', text: { en: 'B' } },
        ],
      } as ListLayer);
    });

    const newId = addListItem(project.id, 'l1');
    expect(newId).toBeTruthy();
    expect(listLayerIn(project.id).items).toHaveLength(3);

    removeListItem(project.id, 'l1', 'r1');
    const items = listLayerIn(project.id).items;
    expect(items).toHaveLength(2);
    expect(items.find((r) => r.id === 'r1')).toBeUndefined();

    // Remaining order is [r2('B'), newId('')]. Move r2 down to index 1.
    reorderListItem(project.id, 'l1', 0, 1);
    const reordered = listLayerIn(project.id).items;
    expect(reordered[0].id).toBe(newId);
    expect(reordered[1].id).toBe('r2');
  });

  it('keeps at least one row when deleting', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [{ id: 'r1', text: { en: 'Only' } }],
      } as ListLayer);
    });
    removeListItem(project.id, 'l1', 'r1');
    expect(listLayerIn(project.id).items).toHaveLength(1);
  });

  it('updateListItemTextForLocale writes a single locale', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [{ id: 'r1', text: { en: 'Hello' } }],
      } as ListLayer);
    });
    updateListItemTextForLocale(project.id, 'l1', 'r1', 'fr', 'Bonjour');
    const row = listLayerIn(project.id).items[0];
    expect(row.text.fr).toBe('Bonjour');
    expect(row.text.en).toBe('Hello'); // source locale untouched
  });

  it('commitListInlineEdit splits lines into rows, preserving surviving ids', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [
          { id: 'r1', text: { en: 'A' } },
          { id: 'r2', text: { en: 'B' } },
        ],
      } as ListLayer);
    });
    const before = listLayerIn(project.id).items.map((r) => r.id);
    commitListInlineEdit(project.id, 'l1', 'en', ['X', 'Y', 'Z']);
    const after = listLayerIn(project.id).items;
    expect(after).toHaveLength(3);
    // Surviving rows keep their id (and other-locale text would be preserved).
    expect(after[0].id).toBe(before[0]);
    expect(after[1].id).toBe(before[1]);
    expect(after[0].text.en).toBe('X');
    expect(after[2].text.en).toBe('Z');
  });

  it('commitListInlineEdit drops trailing rows when fewer lines are typed', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [
          { id: 'r1', text: { en: 'A' } },
          { id: 'r2', text: { en: 'B' } },
          { id: 'r3', text: { en: 'C' } },
        ],
      } as ListLayer);
    });
    commitListInlineEdit(project.id, 'l1', 'en', ['only']);
    const after = listLayerIn(project.id).items;
    expect(after).toHaveLength(1);
    expect(after[0].text.en).toBe('only');
  });

  it('commitListInlineEdit trims trailing empty lines from an accidental Enter', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [{ id: 'r1', text: { en: 'A' } }],
      } as ListLayer);
    });
    // User types two rows then hits Enter at the end without typing anything.
    commitListInlineEdit(project.id, 'l1', 'en', ['A', 'B', '']);
    const after = listLayerIn(project.id).items;
    expect(after).toHaveLength(2);
    expect(after[1].text.en).toBe('B');
  });

  it('setListMarker updates the marker and registers an asset on the project', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [{ id: 'r1', text: { en: 'A' } }],
      } as ListLayer);
    });
    const asset: CalqoAssetRef = {
      id: 'asset-1',
      kind: 'svg',
      name: 'check',
      mimeType: 'image/svg+xml',
      storageKey: 'asset-1',
      createdAt: new Date().toISOString(),
    };
    setListMarker(project.id, 'l1', { kind: 'asset', assetId: asset.id }, asset);
    const layer = listLayerIn(project.id);
    expect(layer.marker.kind).toBe('asset');
    expect(layer.marker.assetId).toBe('asset-1');
    expect(live(project.id).assets.some((a) => a.id === 'asset-1')).toBe(true);
  });
});

describe('list layer — translation & locales', () => {
  it('encodeListRowId / decodeListRowId round-trip', () => {
    const encoded = encodeListRowId('layer-1', 'row-2');
    expect(encoded).toContain('::');
    const decoded = decodeListRowId(encoded);
    expect(decoded).toEqual({ layerId: 'layer-1', rowId: 'row-2' });
    expect(decodeListRowId('plain-id')).toBeNull();
  });

  it('extractTranslationItems emits one item per non-empty row', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [
          { id: 'r1', text: { en: 'First' } },
          { id: 'r2', text: { en: 'Second' } },
          { id: 'r3', text: { en: '   ' } }, // whitespace — skipped
        ],
      } as ListLayer);
    });
    const items = extractTranslationItems(
      project,
      'en',
      'active',
      project.artboards[0].id,
    );
    expect(items).toHaveLength(2);
    expect(items[0].sourceText).toBe('First');
    expect(decodeListRowId(items[0].layerId)).toEqual({ layerId: 'l1', rowId: 'r1' });
  });

  it('applyTranslationResult writes per-row translations via the encoded id', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [
          { id: 'r1', text: { en: 'First' } },
          { id: 'r2', text: { en: 'Second' } },
        ],
      } as ListLayer);
    });
    const artboardId = project.artboards[0].id;
    applyTranslationResult(project.id, {
      targetLocale: 'fr',
      items: [
        { layerId: encodeListRowId('l1', 'r1'), artboardId, translatedText: 'Premier' },
        { layerId: encodeListRowId('l1', 'r2'), artboardId, translatedText: 'Second' },
      ],
    });
    const layer = listLayerIn(project.id);
    expect(layer.items[0].text.fr).toBe('Premier');
    expect(layer.items[1].text.fr).toBe('Second');
    expect(layer.items[0].text.en).toBe('First'); // source untouched
    expect(live(project.id).contentLocales).toContain('fr');
  });

  it('addContentLocale seeds every row from the source locale', () => {
    const project = seedProject((p) => {
      p.contentLocales = ['en'];
      p.activeContentLocale = 'en';
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [
          { id: 'r1', text: { en: 'One' } },
          { id: 'r2', text: { en: 'Two' } },
        ],
      } as ListLayer);
    });
    addContentLocale(project.id, 'fr', { copyFrom: 'en' });
    const layer = listLayerIn(project.id);
    expect(layer.items[0].text.fr).toBe('One');
    expect(layer.items[1].text.fr).toBe('Two');
  });

  it('removeContentLocale clears every row text for that locale', () => {
    const project = seedProject((p) => {
      p.contentLocales = ['en', 'fr'];
      p.activeContentLocale = 'en';
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        items: [{ id: 'r1', text: { en: 'One', fr: 'Un' } }],
      } as ListLayer);
    });
    removeContentLocale(project.id, 'fr');
    const row = listLayerIn(project.id).items[0];
    expect(row.text.fr).toBeUndefined();
    expect(row.text.en).toBe('One');
  });

  it('recomputeOverflow runs over list layers without crashing', () => {
    const project = seedProject((p) => {
      p.artboards[0].layers.push({
        ...baseListLayer,
        id: 'l1',
        // Stale overflow flag from a previous locale — should be refreshed.
        overflow: { hasOverflow: true, measuredAtLocale: 'de', suggestedAction: 'reduce-font' },
        items: [{ id: 'r1', text: { en: 'One' } }],
      } as ListLayer);
    });
    expect(() => recomputeOverflow(project.id)).not.toThrow();
    // Measurement is unavailable in jsdom, so the flag is cleared rather than set.
    expect(listLayerIn(project.id).overflow).toBeUndefined();
  });
});
