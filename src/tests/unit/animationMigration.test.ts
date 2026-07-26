import { describe, it, expect } from 'vitest';
import {
  migrateV1ToV2,
  migrateToCurrent,
  safeImportProject,
  validateProject,
  canDowngradeToV1,
  toV1CompatibleDocument,
  MissingMigrationError,
  CURRENT_SCHEMA_VERSION,
  fixtureProject,
  type CalqoProject,
  type LayerAnimation,
} from '@/lib/schema';
import { remapProjectAssetIds } from '@/editor/assets/assetRemap';

const ISO = '2026-07-19T00:00:00.000Z';

/** A v1 document with nested groups, an asset, and multiple locales. */
function v1Document(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'proj_1',
    name: 'Legacy',
    createdAt: ISO,
    updatedAt: ISO,
    contentLocales: ['en', 'fr'],
    activeContentLocale: 'en',
    palette: ['#000000'],
    assets: [
      {
        id: 'asset_1',
        kind: 'raster',
        name: 'photo',
        mimeType: 'image/png',
        storageKey: 'sk_1',
        createdAt: ISO,
      },
    ],
    glossary: [],
    artboards: [
      {
        id: 'ab_1',
        name: 'Square',
        preset: 'ig-square',
        width: 1080,
        height: 1080,
        background: { type: 'solid', color: '#ffffff' },
        layers: [
          {
            id: 'grp_1',
            name: 'Group',
            type: 'group',
            x: 0,
            y: 0,
            w: 500,
            h: 500,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            children: [
              {
                id: 'img_1',
                name: 'Photo',
                type: 'image',
                x: 0,
                y: 0,
                w: 200,
                h: 200,
                rotation: 0,
                opacity: 1,
                visible: true,
                locked: false,
                assetId: 'asset_1',
                fit: 'cover',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('migrateV1ToV2', () => {
  it('stamps schemaVersion 2 and leaves other content unchanged', () => {
    const v1 = v1Document();
    const v2 = migrateV1ToV2(v1);
    expect(v2.schemaVersion).toBe(2);
    // structurally identical apart from the version stamp
    expect({ ...v2, schemaVersion: 1 }).toEqual(v1);
    // does not mutate the input
    expect(v1.schemaVersion).toBe(1);
  });

  it('migrates a v1 document to a valid v2 project via safeImportProject', () => {
    const result = safeImportProject(v1Document());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      const group = result.project.artboards[0].layers[0];
      expect(group.type).toBe('group');
    }
  });

  it('parses the existing static fixture after migration', () => {
    // fixture is already CURRENT_SCHEMA_VERSION; a re-import is a no-op migrate.
    const result = safeImportProject(fixtureProject);
    expect(result.ok).toBe(true);
  });
});

describe('migrateToCurrent — missing step', () => {
  it('throws MissingMigrationError for an unknown future version', () => {
    expect(() => migrateToCurrent({ schemaVersion: 99, id: 'x' })).toThrow(
      MissingMigrationError,
    );
  });

  it('safeImportProject reports the future-version file as a readable error, not a throw', () => {
    const result = safeImportProject({ schemaVersion: 99, id: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer Calqo/i);
  });
});

describe('v2 → v1 downgrade / compatibility', () => {
  function animatedProject(): CalqoProject {
    const raw = migrateV1ToV2(v1Document());
    const doc = raw as Record<string, unknown>;
    const ab = (doc.artboards as Record<string, unknown>[])[0];
    ab.timing = { duration: 4000 };
    const anim: LayerAnimation = { mode: 'preset', enter: { kind: 'fade', duration: 400, delay: 0 } };
    // Animate the nested image layer.
    ((ab.layers as Record<string, unknown>[])[0].children as Record<string, unknown>[])[0].animation =
      anim;
    const parsed = validateProject(doc);
    expect(parsed.success).toBe(true);
    return (parsed as { data: CalqoProject }).data;
  }

  function staticV2Project(): CalqoProject {
    const parsed = validateProject(migrateV1ToV2(v1Document()));
    return (parsed as { data: CalqoProject }).data;
  }

  it('allows downgrade only for a project with no v2-only data', () => {
    expect(canDowngradeToV1(staticV2Project())).toBe(true);
    expect(canDowngradeToV1(animatedProject())).toBe(false);
  });

  it('serializes an unanimated project as a schemaVersion 1 document without mutating it', () => {
    const project = staticV2Project();
    const doc = toV1CompatibleDocument(project);
    expect(doc).not.toBeNull();
    expect(doc!.schemaVersion).toBe(1);
    expect(project.schemaVersion).toBe(2); // input untouched
    // The downgraded doc re-imports (migrates back to v2) cleanly.
    expect(safeImportProject(doc).ok).toBe(true);
  });

  it('refuses to downgrade an animated project (returns null, drops nothing silently)', () => {
    expect(toV1CompatibleDocument(animatedProject())).toBeNull();
  });

  it('preserves animation through asset remapping without any id rewrite (§4.3 invariant)', () => {
    const project = animatedProject();
    const remapped = remapProjectAssetIds(
      project,
      new Map([['asset_1', 'asset_2']]),
    );
    const group = remapped.artboards[0].layers[0];
    const child = group.type === 'group' ? group.children[0] : group;
    // asset ref rewritten…
    expect((child as { assetId?: string }).assetId).toBe('asset_2');
    // …but the animation block is byte-identical (no asset/layer ids inside).
    expect(child.animation).toEqual(project.artboards[0].layers[0].type === 'group'
      ? (project.artboards[0].layers[0].children[0].animation)
      : undefined);
  });
});
