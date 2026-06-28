import { describe, it, expect } from 'vitest';
import type { CalqoProject } from '@/lib/schema';
import { remapProjectAssetIds } from '@/editor/assets/assetRemap';
import { parseBackup, type CalqoBackup } from '@/editor/backup/appBackup';

/** A minimal project document carrying an asset referenced from several sites:
 * the manifest, an image layer, a grouped svg layer, a list marker, and an
 * artboard background. Cast to the project type — remap is a structural walk and
 * doesn't depend on full schema validity. */
function projectWithAsset(assetId: string): CalqoProject {
  return {
    id: 'proj_1',
    assets: [
      { id: assetId, kind: 'raster', name: 'pic', mimeType: 'image/png', storageKey: assetId },
    ],
    artboards: [
      {
        id: 'ab_1',
        background: { type: 'image', assetId, fit: 'cover' },
        layers: [
          { id: 'l1', type: 'image', assetId },
          {
            id: 'g1',
            type: 'group',
            children: [{ id: 'l2', type: 'svg', assetId }],
          },
          { id: 'l3', type: 'list', marker: { kind: 'asset', assetId } },
        ],
      },
    ],
  } as unknown as CalqoProject;
}

describe('remapProjectAssetIds', () => {
  it('rewrites every asset reference and the manifest id', () => {
    const map = new Map([['asset_old', 'asset_new']]);
    const out = remapProjectAssetIds(projectWithAsset('asset_old'), map);

    expect(out.assets[0].id).toBe('asset_new');
    expect(out.assets[0].storageKey).toBe('asset_new');
    const ab = out.artboards[0];
    expect((ab.background as { assetId: string }).assetId).toBe('asset_new');
    expect((ab.layers[0] as { assetId: string }).assetId).toBe('asset_new');
    const group = ab.layers[1] as { children: { assetId: string }[] };
    expect(group.children[0].assetId).toBe('asset_new');
    const list = ab.layers[2] as { marker: { assetId: string } };
    expect(list.marker.assetId).toBe('asset_new');
  });

  it('leaves references without a mapping untouched and deep-copies the source', () => {
    const source = projectWithAsset('asset_x');
    const out = remapProjectAssetIds(source, new Map([['other', 'nope']]));
    expect(out.assets[0].id).toBe('asset_x');
    expect(out).not.toBe(source);
    expect(out.artboards[0]).not.toBe(source.artboards[0]);
  });
});

describe('parseBackup', () => {
  it('accepts a well-formed backup envelope', () => {
    const backup: CalqoBackup = {
      kind: 'calqo.backup',
      formatVersion: 1,
      app: 'calqo',
      appVersion: '0.0.0',
      createdAt: new Date().toISOString(),
      projects: [],
      settings: {},
      localStorage: {},
    };
    expect(parseBackup(JSON.stringify(backup)).kind).toBe('calqo.backup');
  });

  it('rejects invalid JSON and foreign documents', () => {
    expect(() => parseBackup('{not json')).toThrow();
    expect(() => parseBackup('{"kind":"calqo.project"}')).toThrow();
  });
});
