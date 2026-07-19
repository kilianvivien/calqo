import { describe, it, expect } from 'vitest';
import {
  validateProject,
  safeImportProject,
  migrateV1ToV2,
  toV1CompatibleDocument,
  ENTER_EXIT_PRESET_KINDS,
  EMPHASIS_PRESET_KINDS,
  type CalqoProject,
} from '@/lib/schema';
import { compileClip } from '@/editor/animation/compiler';
import { evaluateLayer } from '@/editor/animation/evaluator';
import {
  buildCalqoFileText,
  buildV1CompatibleCalqoFileText,
} from '@/editor/export/calqoFile';
import {
  v1StaticDocument,
  v2StaticProject,
  v2AllPresetsProject,
  v2CustomBoundaryProject,
  v2NestedGroupProject,
  allV2Fixtures,
} from '../fixtures/animation/fixtures';

describe('animation fixtures — validity', () => {
  it('every v2 fixture validates against the strict schema', () => {
    for (const project of allV2Fixtures) {
      const res = validateProject(project);
      expect(res.success, project.name).toBe(true);
    }
  });
});

describe('animation fixtures — v1 migration', () => {
  it('migrates the frozen v1 document to a valid v2 project, semantically identical', () => {
    const raw = v1StaticDocument as Record<string, unknown>;
    const migrated = migrateV1ToV2(raw);
    expect(migrated.schemaVersion).toBe(2);
    // Only the version stamp changed.
    expect({ ...migrated, schemaVersion: 1 }).toEqual(raw);
    expect(validateProject(migrated).success).toBe(true);
  });
});

describe('animation fixtures — document round-trip', () => {
  it('re-imports each v2 fixture unchanged (JSON stability)', () => {
    for (const project of allV2Fixtures) {
      const roundTripped = safeImportProject(JSON.parse(JSON.stringify(project)));
      expect(roundTripped.ok, project.name).toBe(true);
      if (roundTripped.ok) {
        expect(roundTripped.project).toEqual(project);
      }
    }
  });

  it('exports and re-imports the animated project through a .calqo envelope', async () => {
    const text = await buildCalqoFileText(v2AllPresetsProject);
    const envelope = JSON.parse(text) as { project: unknown };
    const imported = safeImportProject(envelope.project);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      // ids/timestamps are preserved by safeImportProject (adoption mints new
      // ids later); the animation payload survives the envelope round-trip.
      expect(imported.project.artboards[0].layers.map((l) => l.animation)).toEqual(
        v2AllPresetsProject.artboards[0].layers.map((l) => l.animation),
      );
    }
  });

  it('offers a v1-compatible envelope only for the unanimated fixture', async () => {
    expect(toV1CompatibleDocument(v2StaticProject)).not.toBeNull();
    expect(await buildV1CompatibleCalqoFileText(v2StaticProject)).not.toBeNull();
    expect(await buildV1CompatibleCalqoFileText(v2AllPresetsProject)).toBeNull();
  });
});

describe('animation fixtures — compilation', () => {
  const input = (project: CalqoProject) => ({
    projectId: project.id,
    artboard: project.artboards[0],
    locale: project.activeContentLocale,
    fps: project.clipSettings?.fps ?? 30,
  });

  it('compiles every v1 preset with no issues', () => {
    const { clip, issues } = compileClip(input(v2AllPresetsProject));
    expect(issues).toEqual([]);
    // Every animated layer produced at least one window.
    expect(clip.layers).toHaveLength(9);
    for (const layer of clip.layers) {
      expect(layer.windows.length, layer.layerId).toBeGreaterThan(0);
    }
    // Sanity: each enter/exit kind and each emphasis kind is represented by a
    // layer id named after the kind family in the fixture.
    const ids = clip.layers.map((l) => l.layerId);
    for (const family of ['fade', 'slide', 'pop', 'rise', 'wipe', 'blur', 'pulse', 'wiggle', 'float']) {
      expect(ids).toContain(family);
    }
    // Guard the counts stay in step with the catalog.
    expect(ENTER_EXIT_PRESET_KINDS.length).toBe(6);
    expect(EMPHASIS_PRESET_KINDS.length).toBe(3);
  });

  it('clamps custom boundary values to the animatable range on evaluation', () => {
    const { clip, issues } = compileClip(input(v2CustomBoundaryProject));
    expect(issues).toEqual([]);
    const end = evaluateLayer(clip, 'c', 4000);
    expect(end.scaleX).toBeLessThanOrEqual(10);
    expect(end.opacity).toBe(1);
    const start = evaluateLayer(clip, 'c', 0);
    expect(start.blur).toBeLessThanOrEqual(200);
    expect(Number.isFinite(start.dx)).toBe(true);
  });

  it('compiles both the group and its animated child', () => {
    const { clip, issues } = compileClip(input(v2NestedGroupProject));
    expect(issues).toEqual([]);
    const ids = clip.layers.map((l) => l.layerId).sort();
    expect(ids).toEqual(['child-text', 'grp']);
  });
});
