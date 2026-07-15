import { describe, expect, it } from 'vitest';
import { buildProjectDiagnostics } from '@/editor/diagnostics/projectDiagnostics';
import { DEFAULT_AI_SETTINGS } from '@/editor/ai/aiSettings';
import { createDefaultProject } from '@/lib/schema/defaults';
import type { CalqoLayer } from '@/lib/schema';

const echoT = (key: string) => key;

describe('phase N — project diagnostics', () => {
  it('summarizes schema, layer mix, warnings, and provider state without secrets', () => {
    const project = createDefaultProject({ name: 'Diagnostics fixture' });
    project.artboards[0].layers = [
      {
        id: 'shape-fixture',
        name: 'Shape',
        type: 'shape',
        shape: 'rect',
        x: 20,
        y: 20,
        w: 200,
        h: 120,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: { type: 'solid', color: '#0A2540' },
      },
      {
        id: 'text-fixture',
        name: 'Text',
        type: 'text',
        x: 40,
        y: 50,
        w: 160,
        h: 50,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        text: { en: 'Calqo' },
        style: {
          fontFamily: 'Inter',
          fontSize: 32,
          fontWeight: 700,
          fontStyle: 'normal',
          textDecoration: 'none',
          color: '#FFFFFF',
          align: 'left',
          lineHeight: 1.1,
          letterSpacing: 0,
        },
      },
    ] satisfies CalqoLayer[];
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

    const diagnostics = buildProjectDiagnostics(project, settings, echoT);
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.project.schemaVersion).toBe(project.schemaVersion);
    expect(diagnostics.project.assets).toBe(0);
    expect(diagnostics.artboards[0].layers.byType.text).toBeGreaterThan(0);
    expect(diagnostics.artboards[0].layers.byType.shape).toBeGreaterThan(0);
    expect(diagnostics.provider.label).toBe('Google Gemini');
    expect(diagnostics.provider.keyConfigured).toBe(true);
    expect(serialized).not.toContain('secret-test-key');
  });
});
