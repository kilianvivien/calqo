import { beforeEach, describe, expect, it, vi } from 'vitest';

const adapterMocks = vi.hoisted(() => ({
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    getAssetMeta: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

import {
  buildAnimationPackage,
  animationPackageManifestSchema,
  ANIMATION_PACKAGE_MANIFEST_VERSION,
} from '@/editor/export/animationPackage';
import { v2AllPresetsProject, v2StaticProject } from '../fixtures/animation/fixtures';

const decoder = new TextDecoder();

function entry(entries: { name: string; data: Uint8Array }[], name: string) {
  return entries.find((e) => e.name === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  adapterMocks.assetStorage.getAssetBlob.mockResolvedValue(null);
});

describe('buildAnimationPackage (AN-3.4)', () => {
  it('refuses to package an unanimated artboard', async () => {
    await expect(
      buildAnimationPackage(v2StaticProject, v2StaticProject.artboards[0], 'en'),
    ).rejects.toThrow(/no animation/);
  });

  it('emits index.html, manifest.json, and README.md', async () => {
    const { entries, zip } = await buildAnimationPackage(
      v2AllPresetsProject,
      v2AllPresetsProject.artboards[0],
      'en',
    );
    expect(entry(entries, 'index.html')).toBeDefined();
    expect(entry(entries, 'manifest.json')).toBeDefined();
    expect(entry(entries, 'README.md')).toBeDefined();
    expect(zip.byteLength).toBeGreaterThan(0);
    // The HTML actually carries animation.
    const html = decoder.decode(entry(entries, 'index.html')!.data);
    expect(html).toContain('@keyframes calqo-a');
  });

  it('round-trips a schema-valid, versioned manifest with the compiled IR', async () => {
    const { entries, manifest } = await buildAnimationPackage(
      v2AllPresetsProject,
      v2AllPresetsProject.artboards[0],
      'en',
    );
    const raw = JSON.parse(decoder.decode(entry(entries, 'manifest.json')!.data));
    // Re-parse from the serialized bytes (true round-trip), not the in-memory obj.
    const parsed = animationPackageManifestSchema.parse(raw);
    expect(parsed).toEqual(manifest);
    expect(parsed.manifestVersion).toBe(ANIMATION_PACKAGE_MANIFEST_VERSION);
    expect(parsed.tool).toBe('calqo');
    // The IR lists every preset layer.
    expect(parsed.ir.layers.length).toBe(9);
    // Content hashes are present for the text files.
    expect(parsed.files.map((f) => f.path).sort()).toEqual(['README.md', 'index.html']);
    for (const f of parsed.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries no secrets, keys, local paths, or history', async () => {
    const { entries } = await buildAnimationPackage(
      v2AllPresetsProject,
      v2AllPresetsProject.artboards[0],
      'en',
    );
    const manifestText = decoder.decode(entry(entries, 'manifest.json')!.data).toLowerCase();
    for (const forbidden of ['apikey', 'api_key', 'secret', 'token', 'password', 'storagekey', 'dexie', 'createdat', 'updatedat']) {
      expect(manifestText).not.toContain(forbidden);
    }
  });

  it('includes referenced assets with content hashes', async () => {
    // A project whose (single) layer references an asset.
    const project = structuredClone(v2AllPresetsProject);
    const artboard = project.artboards[0];
    (artboard.layers[0] as { assetId?: string }).assetId = 'asset-1';
    (artboard.layers[0] as { type: string }).type = 'image';
    (artboard.layers[0] as { fit?: string }).fit = 'cover';
    project.assets = [
      {
        id: 'asset-1',
        kind: 'raster',
        name: 'Photo',
        mimeType: 'image/png',
        storageKey: 'k',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    adapterMocks.assetStorage.getAssetBlob.mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    );
    const { entries, manifest } = await buildAnimationPackage(project, artboard, 'en');
    expect(entry(entries, 'assets/asset-1.png')).toBeDefined();
    const asset = manifest.assets.find((a) => a.id === 'asset-1');
    expect(asset).toBeDefined();
    expect(asset!.mimeType).toBe('image/png');
    expect(asset!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
