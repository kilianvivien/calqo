import { describe, expect, it } from 'vitest';
import { buildProjectDiagnostics } from '@/editor/diagnostics/projectDiagnostics';
import { DEFAULT_AI_SETTINGS } from '@/editor/ai/aiSettings';
import { createSampleProject } from '@/lib/schema/sampleProject';
import { safeImportProject } from '@/lib/schema';

const echoT = (key: string) => key;

describe('phase N — sample project and diagnostics', () => {
  it('ships a valid editable sample with multilingual content and export warnings', () => {
    const sample = createSampleProject('2026-06-20T00:00:00.000Z');
    const imported = safeImportProject(sample);

    expect(imported.ok).toBe(true);
    expect(sample.contentLocales).toEqual(['en', 'fr', 'tr']);
    expect(sample.assets).toHaveLength(1);
    expect(
      sample.artboards[0].layers.some((layer) => layer.type === 'image'),
    ).toBe(true);

    const diagnostics = buildProjectDiagnostics(sample, DEFAULT_AI_SETTINGS, echoT);
    expect(diagnostics.warnings.unique).toContain('export.warnMissingAsset');
    expect(diagnostics.warnings.unique).toContain('export.warnOverflow');
  });

  it('summarizes schema, layer mix, warnings, and provider state without secrets', () => {
    const sample = createSampleProject('2026-06-20T00:00:00.000Z');
    const settings = {
      ...DEFAULT_AI_SETTINGS,
      providerId: 'gemini' as const,
      storeKey: true,
      providers: {
        ...DEFAULT_AI_SETTINGS.providers,
        gemini: {
          ...DEFAULT_AI_SETTINGS.providers.gemini,
          apiKey: 'secret-test-key',
        },
      },
    };

    const diagnostics = buildProjectDiagnostics(sample, settings, echoT);
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.project.schemaVersion).toBe(sample.schemaVersion);
    expect(diagnostics.project.assets).toBe(1);
    expect(diagnostics.artboards[0].layers.byType.text).toBeGreaterThan(0);
    expect(diagnostics.artboards[0].layers.byType.image).toBe(1);
    expect(diagnostics.provider.label).toBe('Google Gemini');
    expect(diagnostics.provider.keyConfigured).toBe(true);
    expect(serialized).not.toContain('secret-test-key');
  });
});
