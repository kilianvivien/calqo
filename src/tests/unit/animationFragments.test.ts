import { describe, it, expect } from 'vitest';
import type { CalqoLayer, TextStyle } from '@/lib/schema';
import { textStyleSchema } from '@/lib/schema';
import { layoutText, type TextMeasurer } from '@/editor/animation/textLayout';
import {
  compileFragmentAnimation,
  textRevealEnterPreset,
} from '@/editor/animation/fragmentCompiler';
import { fragmentNodeSpecs } from '@/editor/animation/fragmentNodes';
import { resolvePreset } from '@/editor/animation/presets';
import { compileClip } from '@/editor/animation/compiler';
import {
  evaluateFragment,
  evaluateFragmentsInto,
} from '@/editor/animation/evaluator';
import { createIdentityOverride } from '@/editor/animation/evaluator';

/** Deterministic monospace measurer: every glyph advances a fixed width, so
 * layout is reproducible without a canvas. */
function fixedMeasurer(perChar = 10): TextMeasurer {
  return { measure: (text: string) => text.length * perChar };
}

const style: TextStyle = textStyleSchema.parse({ fontSize: 40, lineHeight: 1.5 });

function textLayer(text: string, w = 200, h = 200): CalqoLayer {
  return {
    id: 't1',
    name: 't',
    type: 'text',
    x: 0,
    y: 0,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    text: { en: text },
    style,
  } as unknown as CalqoLayer;
}

describe('textLayout', () => {
  it('wraps words greedily to the box width', () => {
    // perChar 10, width 200 → 20 chars per line before wrapping.
    const layout = layoutText('hello world foo bar baz', style, { w: 200, h: 400 }, fixedMeasurer());
    expect(layout.lineCount).toBeGreaterThan(1);
    // Words never overlap and advance left-to-right within a line.
    const line0 = layout.words.filter((w) => w.line === 0);
    for (let i = 1; i < line0.length; i++) {
      expect(line0[i].x).toBeGreaterThan(line0[i - 1].x);
    }
  });

  it('splits words into characters that tile the word box', () => {
    const layout = layoutText('ab', style, { w: 1000, h: 200 }, fixedMeasurer());
    expect(layout.chars.map((c) => c.text)).toEqual(['a', 'b']);
    expect(layout.chars[0].x).toBe(0);
    expect(layout.chars[1].x).toBe(10);
    expect(layout.words[0].w).toBe(20);
  });

  it('honours explicit newlines as separate lines', () => {
    const layout = layoutText('a\nb', style, { w: 1000, h: 400 }, fixedMeasurer());
    expect(layout.lineCount).toBe(2);
    expect(layout.words[1].y).toBeGreaterThan(layout.words[0].y);
    // Line height = fontSize * lineHeight = 40 * 1.5 = 60.
    expect(layout.words[1].y - layout.words[0].y).toBeCloseTo(60);
  });

  it('centre-aligns lines within the box', () => {
    const centered: TextStyle = { ...style, align: 'center' };
    const layout = layoutText('ab', centered, { w: 100, h: 200 }, fixedMeasurer());
    // Word width 20, box 100 → offset (100 - 20) / 2 = 40.
    expect(layout.words[0].x).toBeCloseTo(40);
  });
});

describe('fragment compiler — typewriter', () => {
  const preset = resolvePreset({ kind: 'typewriter', duration: 1000, delay: 0 });

  it('reveals characters in reading order, each hidden then shown', () => {
    const compiled = compileFragmentAnimation({
      layer: textLayer('abcd', 1000, 200),
      preset,
      box: { w: 1000, h: 200 },
      sceneDuration: 4000,
      measurer: fixedMeasurer(),
      text: 'abcd',
      style,
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.unit).toBe('char');
    expect(compiled!.fragments).toHaveLength(4);

    // First char is revealed almost immediately; last only near the window end.
    const first = compiled!.fragments[0];
    const last = compiled!.fragments[3];
    expect(evaluateFragment(first, 0).opacity).toBeCloseTo(0);
    expect(evaluateFragment(first, 500).opacity).toBeCloseTo(1);
    // At t=500ms (half the 1000ms window) the last char is still hidden.
    expect(evaluateFragment(last, 500).opacity).toBeCloseTo(0);
    // By the end of the window every char is fully shown.
    expect(evaluateFragment(last, 1000).opacity).toBeCloseTo(1);
  });
});

describe('fragment compiler — word-rise', () => {
  const preset = resolvePreset({ kind: 'word-rise', duration: 1000, delay: 0 });

  it('lifts and fades in words with a stagger, settling to identity', () => {
    const compiled = compileFragmentAnimation({
      layer: textLayer('one two three', 1000, 200),
      preset,
      box: { w: 1000, h: 200 },
      sceneDuration: 4000,
      measurer: fixedMeasurer(),
      text: 'one two three',
      style,
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.unit).toBe('word');
    expect(compiled!.fragments).toHaveLength(3);

    const firstWord = compiled!.fragments[0];
    // Starts offset downward and transparent.
    const atStart = evaluateFragment(firstWord, 0);
    expect(atStart.opacity).toBeCloseTo(0);
    expect(atStart.dy).toBeGreaterThan(0);
    // Settles to identity by the window end.
    const settled = evaluateFragment(firstWord, 1000);
    expect(settled.opacity).toBeCloseTo(1);
    expect(settled.dy).toBeCloseTo(0);

    // The last word starts after the first (stagger).
    const lastWord = compiled!.fragments[2];
    expect(evaluateFragment(lastWord, 0).opacity).toBeCloseTo(0);
    expect(evaluateFragment(lastWord, 1000).opacity).toBeCloseTo(1);
  });

  it('evaluateFragmentsInto reuses caller objects across frames', () => {
    const compiled = compileFragmentAnimation({
      layer: textLayer('a b', 1000, 200),
      preset,
      box: { w: 1000, h: 200 },
      sceneDuration: 4000,
      measurer: fixedMeasurer(),
      text: 'a b',
      style,
    })!;
    const out = [createIdentityOverride()];
    evaluateFragmentsInto(compiled, 500, out);
    expect(out).toHaveLength(2);
    const ref = out[0];
    evaluateFragmentsInto(compiled, 700, out);
    expect(out[0]).toBe(ref); // same object reused, not reallocated
  });
});

describe('fragmentNodeSpecs', () => {
  it('maps compiled fragments to ordered render specs with layer-local boxes', () => {
    const compiled = compileFragmentAnimation({
      layer: textLayer('ab cd', 1000, 200),
      preset: resolvePreset({ kind: 'word-rise', duration: 800, delay: 0 }),
      box: { w: 1000, h: 200 },
      sceneDuration: 4000,
      measurer: fixedMeasurer(),
      text: 'ab cd',
      style,
    })!;
    const specs = fragmentNodeSpecs(compiled);
    expect(specs.map((s) => s.text)).toEqual(['ab', 'cd']);
    expect(specs[0].index).toBe(0);
    // Boxes come straight from the compiled fragments (layer-local).
    expect(specs[0].box).toMatchObject({ x: compiled.fragments[0].x, w: compiled.fragments[0].w });
    expect(specs[1].box.x).toBeGreaterThan(specs[0].box.x);
  });
});

describe('textRevealEnterPreset detection', () => {
  it('detects a text-reveal enter preset on a text layer', () => {
    const layer = {
      ...textLayer('hi'),
      animation: { mode: 'preset', enter: { kind: 'typewriter', duration: 800, delay: 0 } },
    } as unknown as CalqoLayer;
    expect(textRevealEnterPreset(layer)?.kind).toBe('typewriter');
  });

  it('ignores transform presets and non-text layers', () => {
    const layer = {
      ...textLayer('hi'),
      animation: { mode: 'preset', enter: { kind: 'fade', duration: 500, delay: 0 } },
    } as unknown as CalqoLayer;
    expect(textRevealEnterPreset(layer)).toBeNull();
  });
});

describe('compileClip fragment production (AN-3.5 enabled)', () => {
  function artboardWith(layer: CalqoLayer) {
    return {
      id: 'ab',
      name: 'a',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#ffffff' },
      timing: { duration: 4000 },
      layers: [layer],
    } as never;
  }

  it('emits fragments for a top-level reveal layer when a measurer is supplied', () => {
    const layer = {
      ...textLayer('hello world'),
      animation: { mode: 'preset', enter: { kind: 'word-rise', duration: 800, delay: 0 } },
    } as unknown as CalqoLayer;
    const result = compileClip({
      projectId: 'p',
      artboard: artboardWith(layer),
      locale: 'en',
      fps: 30,
      measurerFor: () => fixedMeasurer(),
    });
    expect(result.clip.fragments).toHaveLength(1);
    expect(result.clip.fragments?.[0].unit).toBe('word');
    // The reveal is fragment-owned, so no layer-level enter window is emitted.
    expect(result.clip.layers).toHaveLength(0);
  });

  it('emits no fragments without a measurer (e.g. non-canvas contexts)', () => {
    const layer = {
      ...textLayer('hello world'),
      animation: { mode: 'preset', enter: { kind: 'typewriter', duration: 800, delay: 0 } },
    } as unknown as CalqoLayer;
    const result = compileClip({
      projectId: 'p',
      artboard: artboardWith(layer),
      locale: 'en',
      fps: 30,
    });
    expect(result.clip.fragments).toBeUndefined();
  });
});
