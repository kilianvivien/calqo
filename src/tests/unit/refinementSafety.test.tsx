import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { GlassSegmentedControl } from '@/components/glass/GlassSegmentedControl';
import { sanitizeSvg } from '@/lib/utils/svg';
import { documentBudgetError, rasterBudgetError } from '@/lib/schema/budgets';
import { safeImportProject } from '@/lib/schema';
import { fixtureProject } from '@/lib/schema/fixture';
import { normalizeAiSettings } from '@/editor/ai/aiSettings';
import { aiReadiness } from '@/editor/ai/readiness';
import { getProvider } from '@/editor/ai/providerRegistry';
import {
  splitAiSecrets,
  mergeAiSecrets,
} from '@/lib/adapters/settings/aiSecretPayload';
import { collectLayerExportIssues } from '@/editor/export/exportReadiness';

describe('refinement safety boundaries', () => {
  it('rejects excessive nesting before recursive schema validation', () => {
    const nested: Record<string, unknown> = {};
    let child = nested;
    for (let i = 0; i < 100; i++) {
      child.next = {};
      child = child.next as Record<string, unknown>;
    }
    expect(documentBudgetError(nested)).toMatch(/nested/);
    expect(safeImportProject(nested).ok).toBe(false);
    expect(safeImportProject(fixtureProject).ok).toBe(true);
    expect(documentBudgetError({ timestamp: Date.now() })).toBeNull();
  });

  it('rejects unsafe canvas allocations but permits normal social formats', () => {
    expect(rasterBudgetError(1080, 1920, 2)).toBe(false);
    expect(rasterBudgetError(1080, 1920, 4)).toBe(true);
    expect(rasterBudgetError(1, 20000, 1)).toBe(true);
    expect(rasterBudgetError(100, 100, NaN)).toBe(true);
    expect(rasterBudgetError(100, 100, 0)).toBe(true);
    expect(documentBudgetError({ artboards: Array(101).fill({}) })).toMatch(
      /artboards/,
    );
    expect(
      documentBudgetError({ width: 20000, height: 100, layers: [] }),
    ).toMatch(/dimensions/);
  });

  it('strips executable SVG and external resources while preserving local artwork', () => {
    const clean =
      sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)">
      <defs><linearGradient id="gradient"><stop stop-color="red"/></linearGradient></defs>
      <script>alert(1)</script><foreignObject><div>unsafe</div></foreignObject>
      <style>@import url(https://example.com/track);</style>
      <image href="https://example.com/image.png"/><use href="#shape"/>
      <rect id="shape" width="50" height="50" fill="url(#gradient)" style="opacity:0.5"/>
      <path fill="u\\72l(https://example.com/track)"/>
      <animate attributeName="href" values="https://example.com"/>
    </svg>`);
    const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
    expect(
      doc.querySelector('script, foreignObject, style, animate'),
    ).toBeNull();
    expect(doc.documentElement.hasAttribute('onload')).toBe(false);
    expect(doc.querySelector('image')?.hasAttribute('href')).toBe(false);
    expect(doc.querySelector('path')?.hasAttribute('fill')).toBe(false);
    expect(doc.querySelector('use')?.getAttribute('href')).toBe('#shape');
    expect(doc.querySelector('rect')?.getAttribute('fill')).toBe(
      'url(#gradient)',
    );
    expect(doc.querySelector('rect')?.getAttribute('style')).toBe(
      'opacity:0.5',
    );
    expect(sanitizeSvg('<svg>' + 'x'.repeat(2 * 1024 * 1024) + '</svg>')).toBe(
      '',
    );
  });

  it('requires explicit demo mode and never substitutes it for incomplete setup', () => {
    const settings = normalizeAiSettings();
    expect(getProvider(settings)).toBeNull();
    settings.providerId = 'custom';
    expect(aiReadiness(settings).issues).toEqual(['endpoint', 'model', 'key']);
    expect(getProvider(settings)).toBeNull();
    settings.providers.custom = {
      baseUrl: 'https://user:password@example.com/v1',
      model: 'model',
      apiKey: 'secret',
    };
    expect(aiReadiness(settings).issues).toEqual(['endpoint']);
    settings.providerId = 'local';
    expect(aiReadiness(settings).destination).toBe('local');
    settings.providerId = 'demo';
    expect(aiReadiness(settings).ready).toBe(true);
    expect(getProvider(settings)).not.toBeNull();
    expect(
      normalizeAiSettings({ providerId: 'constructor' as never }).providerId,
    ).toBe('off');
  });

  it('separates keys without mutating preferences and merges only own secrets', () => {
    const settings = normalizeAiSettings();
    settings.providers.custom.apiKey = 'test-secret';
    const split = splitAiSecrets(settings);
    expect(JSON.stringify(split.settings)).not.toContain('test-secret');
    expect(settings.providers.custom.apiKey).toBe('test-secret');
    expect(mergeAiSecrets(split.settings, split.keys)).toEqual(settings);
    const malicious = JSON.parse(
      '{"providers":{"__proto__":{"apiKey":"secret"}}}',
    );
    expect(Object.getPrototypeOf(splitAiSecrets(malicious).keys)).toBeNull();
  });

  it('retains separate issue targets for layers with identical names', () => {
    const project = structuredClone(fixtureProject);
    const shape = project.artboards[0].layers[0];
    shape.x = -20;
    project.artboards[0].layers = [shape, { ...shape, id: 'second' }];
    const warnings = collectLayerExportIssues(project.artboards, ['en']);
    expect(warnings.map((warning) => warning.layerId)).toEqual([
      shape.id,
      'second',
    ]);
    project.artboards[0].layers[1].visible = false;
    expect(collectLayerExportIssues(project.artboards, ['en'])).toHaveLength(1);
  });

  it('supports radio keyboard navigation, skips disabled options and wraps', () => {
    const changed = vi.fn();
    function Control() {
      const [value, setValue] = useState('a');
      return (
        <GlassSegmentedControl
          value={value}
          onChange={(next) => {
            setValue(next);
            changed(next);
          }}
          options={[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta', disabled: true },
            { value: 'c', label: 'Gamma' },
          ]}
        />
      );
    }
    render(<Control />);
    screen.getByRole('radio', { name: 'Alpha' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveFocus();
    expect(changed).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });
});
