import { afterEach, describe, expect, it, vi } from 'vitest';

// fake-indexeddb does not round-trip Blob content in jsdom, so the shared
// asset store is replaced with an in-memory map; the brand-profile and
// settings tables stay on the real Dexie adapters.
const memoryAssets = vi.hoisted(() => {
  const blobs = new Map<string, { blob: Blob; meta: Record<string, unknown> }>();
  let seq = 0;
  return {
    blobs,
    adapter: {
      async saveAsset(
        _projectId: string,
        blob: Blob,
        meta: { name: string; mimeType: string; kind: 'raster' | 'svg'; width?: number; height?: number },
      ) {
        seq += 1;
        const id = `asset-mem-${seq}`;
        blobs.set(id, { blob, meta });
        return {
          id,
          kind: meta.kind,
          name: meta.name,
          mimeType: meta.mimeType,
          width: meta.width,
          height: meta.height,
          storageKey: id,
          createdAt: '2026-07-01T00:00:00.000Z',
        };
      },
      async getAssetBlob(id: string) {
        return blobs.get(id)?.blob ?? null;
      },
      async getAssetMeta(id: string) {
        return (blobs.get(id)?.meta as never) ?? null;
      },
      async deleteAsset(id: string) {
        blobs.delete(id);
      },
      async restoreAsset() {},
    },
  };
});

vi.mock('@/lib/adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adapters')>();
  return { ...actual, assetStorage: memoryAssets.adapter };
});

import { buildTemplatePrompt } from '@/editor/ai/prompts';
import { buildTemplateInput, generateTemplate } from '@/editor/ai/promptTemplateService';
import { mockProvider } from '@/editor/ai/mockProvider';
import { applyBrandProfile, insertBrandLogo, undoProject } from '@/editor/commands/projectCommands';
import {
  createBrandProfile,
  deleteBrandProfile,
  listBrandProfiles,
  saveBrandProfile,
  setBrandLogo,
} from '@/editor/brand/brandService';
import { buildAppBackup, restoreAppBackup } from '@/editor/backup/appBackup';
import { buildCalqoFile } from '@/editor/export/calqoFile';
import { createDefaultProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';

afterEach(async () => {
  projectStore.setState({ projects: {}, saveState: {} });
  historyStore.setState({ histories: {} });
  selectionStore.setState({
    activeArtboardId: null,
    selectedLayerIds: [],
    hoveredLayerId: null,
  });
  useUiStore.getState().setBrandFontDefaults(null);
  for (const profile of await listBrandProfiles()) {
    await deleteBrandProfile(profile.id);
  }
});

describe('applyBrandProfile', () => {
  it('sets the palette, merges the glossary deduplicated, in one undo step, without touching layers', () => {
    const project = createDefaultProject();
    project.glossary.push({ source: 'Calqo', mode: 'do-not-translate' });
    project.artboards[0].layers.push({
      id: 't1',
      name: 'Title',
      type: 'text',
      x: 0,
      y: 0,
      w: 100,
      h: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: { en: 'Hello' },
      style: {
        fontFamily: 'Inter',
        fontSize: 40,
        fontWeight: 700,
        fontStyle: 'normal',
        textDecoration: 'none',
        color: '#111827',
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    });
    projectStore.getState().upsertProject(project);
    const layersBefore = structuredClone(project.artboards[0].layers);

    applyBrandProfile(project.id, {
      palette: ['#123456', '#ABCDEF'],
      glossary: [
        { source: 'calqo', mode: 'do-not-translate' }, // dedup, case-insensitive
        { source: 'GeoCarto', mode: 'preferred-translation', target: 'GeoCarto' },
      ],
      headingFont: 'Space Grotesk',
      bodyFont: 'Inter',
    });

    const current = projectStore.getState().projects[project.id];
    expect(current.palette).toEqual(['#123456', '#ABCDEF']);
    expect(current.glossary.map((entry) => entry.source)).toEqual([
      'Calqo',
      'GeoCarto',
    ]);
    expect(current.artboards[0].layers).toEqual(layersBefore);
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
    expect(useUiStore.getState().brandFontDefaults).toEqual({
      heading: 'Space Grotesk',
      body: 'Inter',
    });

    undoProject(project.id);
    const undone = projectStore.getState().projects[project.id];
    expect(undone.palette).toEqual(project.palette);
    expect(undone.glossary).toHaveLength(1);
  });
});

describe('prompt seeding', () => {
  it('places the brand palette and fonts in the generation context, never secrets', () => {
    const input = buildTemplateInput({
      prompt: 'A launch card',
      preset: 'ig-square',
      locale: 'en',
      palette: ['#0A2540', '#E8B339'],
      brandFonts: { heading: 'Space Grotesk', body: 'Inter' },
    });
    const { system, user } = buildTemplatePrompt(input);
    expect(system).toContain('#0A2540, #E8B339');
    expect(system).toContain('"Space Grotesk" for headlines');
    expect(system).toContain('"Inter" for body and list text');
    expect(`${system}\n${user}`).not.toMatch(/api[-_ ]?key|secret|token/i);
  });

  it('produces mock layouts with the selected palette and distinct brand fonts', async () => {
    const result = await generateTemplate(mockProvider, {
      prompt: 'A launch card', preset: 'ig-square', locale: 'en',
      palette: ['#112233', '#F8FAFC', '#FF5500'],
      brandFonts: { heading: 'Space Grotesk', body: 'Inter' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.palette).toEqual(['#112233', '#F8FAFC', '#FF5500']);
    const textLayers = result.project.artboards[0].layers.filter((layer) => layer.type === 'text');
    expect(textLayers[0]?.type === 'text' && textLayers[0].style.fontFamily).toBe('Space Grotesk');
    expect(textLayers[1]?.type === 'text' && textLayers[1].style.fontFamily).toBe('Inter');
  });
});

describe('brand profile backup round-trip', () => {
  it('backs up profiles with logos and restores them additively under fresh ids', async () => {
    const created = await createBrandProfile('Acme');
    await saveBrandProfile({
      ...created,
      palette: ['#FF0000'],
      headingFont: 'Space Grotesk',
      glossary: [{ source: 'Acme', mode: 'do-not-translate' }],
    });
    const withLogo = await setBrandLogo(
      (await listBrandProfiles())[0],
      new Blob(['logo-bytes'], { type: 'image/png' }),
      { name: 'logo.png', mimeType: 'image/png', width: 10, height: 10 },
    );
    expect(withLogo.logoAssetId).toBeTruthy();

    const backup = await buildAppBackup();
    expect(backup.brandProfiles).toHaveLength(1);
    expect(backup.brandProfiles?.[0].logo?.dataUrl).toContain('data:image/png');
    // No key material rides along.
    expect(JSON.stringify(backup.brandProfiles)).not.toMatch(/apiKey/);

    await restoreAppBackup(backup);
    const profiles = await listBrandProfiles();
    expect(profiles).toHaveLength(2);
    const restored = profiles.find((profile) => profile.id !== withLogo.id);
    expect(restored?.name).toBe('Acme');
    expect(restored?.palette).toEqual(['#FF0000']);
    expect(restored?.glossary).toEqual([{ source: 'Acme', mode: 'do-not-translate' }]);
    expect(restored?.logoAssetId).toBeTruthy();
    expect(restored?.logoAssetId).not.toBe(withLogo.logoAssetId);
  });
});

describe('brand logo insertion', () => {
  it('copies the logo under a project-scoped id and exports a self-contained envelope', async () => {
    const profile = await setBrandLogo(
      await createBrandProfile('Acme'),
      new Blob(['logo'], { type: 'image/png' }),
      { name: 'logo.png', mimeType: 'image/png', width: 10, height: 10 },
    );
    const project = createDefaultProject();
    projectStore.getState().upsertProject(project);
    selectionStore.getState().setActiveArtboard(project.artboards[0].id);
    expect(await insertBrandLogo(project.id, profile)).toBe(true);
    const current = projectStore.getState().projects[project.id];
    const inserted = current.assets.find((asset) => asset.id !== profile.logoAssetId);
    expect(inserted?.id).toBeTruthy();
    expect(inserted?.id).not.toBe(profile.logoAssetId);
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
    const envelope = await buildCalqoFile(current);
    expect(envelope.assets.map((asset) => asset.id)).toContain(inserted!.id);
    expect(envelope.assets.map((asset) => asset.id)).not.toContain(profile.logoAssetId);
  });
});
