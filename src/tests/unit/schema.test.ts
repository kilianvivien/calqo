import { describe, it, expect } from 'vitest';
import {
  createDefaultProject,
  createArtboard,
  validateProject,
  safeImportProject,
  detectSchemaVersion,
  fixtureProject,
  CURRENT_SCHEMA_VERSION,
} from '@/lib/schema';

describe('schema defaults', () => {
  it('creates a valid default project', () => {
    const project = createDefaultProject();
    expect(validateProject(project).success).toBe(true);
    expect(project.artboards).toHaveLength(1);
    expect(project.contentLocales).toContain(project.activeContentLocale);
  });

  it('honors create options', () => {
    const project = createDefaultProject({
      name: 'Launch',
      preset: 'story',
      locale: 'fr',
    });
    expect(project.name).toBe('Launch');
    expect(project.artboards[0].width).toBe(1080);
    expect(project.artboards[0].height).toBe(1920);
    expect(project.activeContentLocale).toBe('fr');
  });

  it('builds artboards from presets', () => {
    const ab = createArtboard('youtube-thumbnail');
    expect(ab.width).toBe(1280);
    expect(ab.height).toBe(720);
  });
});

describe('fixture', () => {
  it('validates against the strict schema', () => {
    const result = validateProject(fixtureProject);
    expect(result.success).toBe(true);
  });
});

describe('validation and import', () => {
  it('produces readable errors for an invalid document', () => {
    const result = safeImportProject({ schemaVersion: 1, name: 'broken' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues && result.issues.length).toBeGreaterThan(0);
    }
  });

  it('strips unknown future fields on import', () => {
    const withExtra = {
      ...structuredClone(fixtureProject),
      somethingFromTheFuture: 42,
    };
    const result = safeImportProject(withExtra);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('somethingFromTheFuture' in result.project).toBe(false);
    }
  });

  it('detects the schema version, defaulting to 1', () => {
    expect(detectSchemaVersion(fixtureProject)).toBe(CURRENT_SCHEMA_VERSION);
    expect(detectSchemaVersion({})).toBe(1);
  });
});
