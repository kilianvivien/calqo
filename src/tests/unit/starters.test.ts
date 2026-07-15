import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalqoAssetRef } from '@/lib/schema';

const adapterMocks = vi.hoisted(() => ({
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    getAssetMeta: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
  dialog: { confirm: vi.fn() },
  storage: {
    saveProject: vi.fn(),
    getProject: vi.fn(),
    deleteProject: vi.fn(),
    listProjects: vi.fn(),
  },
  starterLibrary: {
    listStarters: vi.fn(),
    getStarter: vi.fn(),
    saveStarter: vi.fn(),
    renameStarter: vi.fn(),
    deleteStarter: vi.fn(),
  },
  files: { downloadBlob: vi.fn() },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

import { createProjectFromStarter } from '@/editor/starters/starterService';
import { safeImportProject } from '@/lib/schema';
import type { CalqoFile } from '@/lib/adapters/file/FileImportExportAdapter';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';

const STARTERS_DIR = join(__dirname, '../../../public/starters');

interface StarterIndex {
  starters: { id: string; name: string; file: string; tags: string[]; thumbnail: string; width: number; height: number; presets: string[] }[];
}

describe('bundled starter gallery', () => {
  const index = JSON.parse(
    readFileSync(join(STARTERS_DIR, 'index.json'), 'utf8'),
  ) as StarterIndex;

  it('lists every .calqo file in the directory (no orphans, no dead links)', () => {
    const filesOnDisk = readdirSync(STARTERS_DIR).filter((name) =>
      name.endsWith('.calqo'),
    );
    expect(new Set(index.starters.map((entry) => entry.file))).toEqual(
      new Set(filesOnDisk),
    );
    expect(index.starters.length).toBeGreaterThanOrEqual(6);
    for (const entry of index.starters) {
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.presets.length).toBeGreaterThan(0);
      expect(entry.width).toBeGreaterThan(0);
      expect(entry.height).toBeGreaterThan(0);
      expect(existsSync(join(STARTERS_DIR, entry.thumbnail.replace('/starters/', '')))).toBe(true);
    }
  });

  it.each(
    index.starters.map((entry) => [entry.id, entry.file] as const),
  )('starter %s validates against the current schema', (_id, file) => {
    const envelope = JSON.parse(
      readFileSync(join(STARTERS_DIR, file), 'utf8'),
    ) as CalqoFile;
    expect(envelope.kind).toBe('calqo.project');
    const result = safeImportProject(envelope.project);
    expect(result.ok, JSON.stringify(!result.ok && result.issues)).toBe(true);
    if (!result.ok) return;
    // License-clean by construction: bundled starters embed no binary assets.
    expect(envelope.assets).toEqual([]);
    expect(result.project.assets).toEqual([]);
    // Each starter has real content to edit.
    expect(
      result.project.artboards.reduce((sum, ab) => sum + ab.layers.length, 0),
    ).toBeGreaterThan(2);
  });

  it('includes a multilingual starter with EN/FR/TR variants', () => {
    const entry = index.starters.find((candidate) =>
      candidate.tags.includes('multilingual'),
    );
    expect(entry).toBeTruthy();
    const envelope = JSON.parse(
      readFileSync(join(STARTERS_DIR, entry!.file), 'utf8'),
    ) as CalqoFile;
    const result = safeImportProject(envelope.project);
    expect(result.ok && result.project.contentLocales).toEqual(['en', 'fr', 'tr']);
  });
});

describe('createProjectFromStarter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let counter = 0;
    adapterMocks.assetStorage.saveAsset.mockImplementation(
      async (_projectId: string, _blob: Blob, meta: { name: string; mimeType: string; kind: 'raster' | 'svg' }) => {
        counter += 1;
        return {
          id: `asset-fresh-${counter}`,
          kind: meta.kind,
          name: meta.name,
          mimeType: meta.mimeType,
          storageKey: `asset-fresh-${counter}`,
          createdAt: '2026-07-01T00:00:00.000Z',
        } satisfies CalqoAssetRef;
      },
    );
  });

  afterEach(() => {
    projectStore.setState({ projects: {}, saveState: {} });
    workspaceStore.setState({ openTabIds: [], activeProjectId: null });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
  });

  it('clones assets under fresh ids and never mutates the source envelope', async () => {
    const index = JSON.parse(
      readFileSync(join(STARTERS_DIR, 'index.json'), 'utf8'),
    ) as StarterIndex;
    const source = JSON.parse(
      readFileSync(join(STARTERS_DIR, index.starters[0].file), 'utf8'),
    ) as CalqoFile;
    // Give the starter an inlined asset referenced by a layer.
    const withAsset = structuredClone(source);
    withAsset.project.assets.push({
      id: 'asset-orig',
      kind: 'raster',
      name: 'pic.png',
      mimeType: 'image/png',
      width: 4,
      height: 4,
      storageKey: 'asset-orig',
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    withAsset.project.artboards[0].layers.push({
      id: 'img-1',
      name: 'Pic',
      type: 'image',
      x: 0,
      y: 0,
      w: 40,
      h: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      assetId: 'asset-orig',
      fit: 'cover',
    });
    withAsset.assets.push({
      id: 'asset-orig',
      name: 'pic.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    const snapshot = structuredClone(withAsset);

    const projectId = await createProjectFromStarter(withAsset);

    const created = projectStore.getState().projects[projectId];
    expect(created).toBeTruthy();
    expect(created.id).not.toBe(withAsset.project.id);
    const image = created.artboards[0].layers.find((layer) => layer.name === 'Pic');
    expect(image && image.type === 'image' && image.assetId).toBe('asset-fresh-1');
    expect(created.assets.find((ref) => ref.id === 'asset-orig')).toBeUndefined();
    const [savedProjectId, , savedMeta] =
      adapterMocks.assetStorage.saveAsset.mock.calls[0];
    expect(savedProjectId).toBe(created.id);
    expect(savedMeta).toMatchObject({ name: 'pic.png', kind: 'raster' });
    // The starter envelope itself is untouched.
    expect(withAsset).toEqual(snapshot);
  });

  it('rejects a malformed starter envelope gracefully', async () => {
    await expect(
      createProjectFromStarter({ project: { schemaVersion: 1, nope: true } }),
    ).rejects.toThrow();
  });
});
