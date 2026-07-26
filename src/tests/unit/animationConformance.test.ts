import { describe, expect, it } from 'vitest';
import { compileClip } from '@/editor/animation/compiler';
import { evaluateClip, evaluateFragment } from '@/editor/animation/evaluator';
import {
  compileAnimationCss,
  compileFragmentCss,
} from '@/editor/export/animationCssCompiler';
import { compileFragmentAnimation } from '@/editor/animation/fragmentCompiler';
import { resolvePreset } from '@/editor/animation/presets';
import type { TextMeasurer } from '@/editor/animation/textLayout';
import { wipeClipRect, type LayerBox } from '@/editor/animation/wrapperNode';
import type { CalqoArtboard, CalqoLayer, CalqoProject, TextStyle } from '@/lib/schema';
import { textStyleSchema } from '@/lib/schema';
import { v2AllPresetsProject, v2NestedGroupProject } from '../fixtures/animation/fixtures';
import enEditor from '@/locales/en/editor.json';
import frEditor from '@/locales/fr/editor.json';

/**
 * AN-3.3 cross-renderer conformance. The evaluator is the source of truth for
 * MP4/GIF; the CSS compiler is a second implementation of the same IR. This
 * suite samples both at identical timestamps — parsing the emitted `@keyframes`
 * back into numbers and comparing them to a fresh evaluator run at each stop's
 * time — for translate, scale, rotation, opacity, clip, and blur, within
 * tolerance (plan §6.2 / §11 / AN-3.3). True browser computed-style sampling
 * belongs in the Playwright suite; this proves the encoding + time mapping.
 */

const PX_TOL = 0.02; // matches the compiler's 2-dp px/deg rounding
const FACTOR_TOL = 0.0002; // matches 4-dp scale/opacity rounding

interface ParsedStop {
  tMs: number;
  dx: number;
  dy: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  blur: number;
  clip: { x: number; y: number; width: number; height: number } | null;
}

function boxesFor(artboard: CalqoArtboard): Map<string, LayerBox> {
  const map = new Map<string, LayerBox>();
  const walk = (layers: CalqoArtboard['layers']) => {
    for (const l of layers) {
      map.set(l.id, { x: l.x, y: l.y, w: l.w, h: l.h });
      if (l.type === 'group') walk(l.children);
    }
  };
  walk(artboard.layers);
  return map;
}

function num(re: RegExp, s: string, fallback: number): number {
  const m = s.match(re);
  return m ? parseFloat(m[1]) : fallback;
}

/** Parse one keyframes block's stops into structured numbers. */
function parseKeyframes(css: string, name: string, sceneDurationMs: number): ParsedStop[] {
  const block = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`no @keyframes for ${name}`);
  const stops: ParsedStop[] = [];
  const stopRe = /([\d.]+)% \{ ([^}]*) \}/g;
  let m: RegExpExecArray | null;
  while ((m = stopRe.exec(block[1])) !== null) {
    const pct = parseFloat(m[1]);
    const decls = m[2];
    const transform = decls.match(/transform:([^;]+);/)?.[1] ?? 'none';
    const trans = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    const rot = transform.match(/rotate\(([-\d.]+)deg\)/);
    const scale = transform.match(/scale\(([-\d.]+), ([-\d.]+)\)/);
    const blurM = decls.match(/filter:blur\(([-\d.]+)px\)/);
    let clip: ParsedStop['clip'] = null;
    const poly = decls.match(/clip-path:polygon\(([^)]+)\)/);
    if (poly) {
      const pts = poly[1]
        .split(',')
        .map((p) => p.trim().split(/\s+/).map((v) => parseFloat(v)));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      clip = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    stops.push({
      tMs: (pct / 100) * sceneDurationMs,
      dx: trans ? parseFloat(trans[1]) : 0,
      dy: trans ? parseFloat(trans[2]) : 0,
      rotation: rot ? parseFloat(rot[1]) : 0,
      scaleX: scale ? parseFloat(scale[1]) : 1,
      scaleY: scale ? parseFloat(scale[2]) : 1,
      opacity: num(/opacity:([-\d.]+);/, decls, 1),
      blur: blurM ? parseFloat(blurM[1]) : 0,
      clip,
    });
  }
  return stops;
}

/** Assert every parsed CSS stop matches a fresh evaluator run at the same time. */
function expectConformance(
  project: CalqoProject,
  artboard: CalqoArtboard,
  layerId: string,
) {
  const sceneDurationMs = artboard.timing?.duration ?? 5000;
  const boxes = boxesFor(artboard);
  const box = boxes.get(layerId)!;
  const { clip } = compileClip({ projectId: project.id, artboard, locale: 'en', fps: 30 });
  const { css, bindings } = compileAnimationCss({
    clip,
    boxes,
    sceneDurationMs,
    scopeId: 't',
  });
  const binding = bindings.get(layerId);
  expect(binding, `layer ${layerId} should animate`).toBeDefined();
  const stops = parseKeyframes(css, binding!.wrapperClass, sceneDurationMs);
  expect(stops.length).toBeGreaterThan(1);

  for (const stop of stops) {
    const overrides = evaluateClip(clip, stop.tMs);
    const o = overrides.get(layerId) ?? {
      dx: 0, dy: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, wipeProgress: 1, blur: 0,
      wipeDirection: undefined,
    };
    expect(stop.dx, `dx@${stop.tMs}`).toBeCloseTo(o.dx, 1);
    expect(stop.dy, `dy@${stop.tMs}`).toBeCloseTo(o.dy, 1);
    expect(Math.abs(stop.rotation - o.rotation)).toBeLessThanOrEqual(PX_TOL);
    expect(Math.abs(stop.scaleX - o.scaleX)).toBeLessThanOrEqual(FACTOR_TOL);
    expect(Math.abs(stop.scaleY - o.scaleY)).toBeLessThanOrEqual(FACTOR_TOL);
    expect(Math.abs(stop.opacity - o.opacity)).toBeLessThanOrEqual(FACTOR_TOL);
    expect(Math.abs(stop.blur - o.blur)).toBeLessThanOrEqual(PX_TOL);
    // Normalize "no clip" (fully revealed) to a full-box rectangle on both
    // sides, so a reveal that is 1e-7 short of complete at a reconstructed
    // boundary time still compares equal within tolerance.
    const full = { x: box.x, y: box.y, width: box.w, height: box.h };
    const expectedClip = wipeClipRect(box, o.wipeProgress, o.wipeDirection) ?? full;
    const actualClip = stop.clip ?? full;
    expect(Math.abs(actualClip.x - expectedClip.x), `clipX@${stop.tMs}`).toBeLessThanOrEqual(PX_TOL);
    expect(Math.abs(actualClip.width - expectedClip.width), `clipW@${stop.tMs}`).toBeLessThanOrEqual(PX_TOL);
    expect(Math.abs(actualClip.height - expectedClip.height), `clipH@${stop.tMs}`).toBeLessThanOrEqual(PX_TOL);
  }
}

describe('AN-3.3 CSS ↔ evaluator conformance', () => {
  const artboard = v2AllPresetsProject.artboards[0];
  const presetIds = ['fade', 'slide', 'pop', 'rise', 'wipe', 'blur', 'pulse', 'wiggle', 'float'];

  for (const id of presetIds) {
    it(`conforms for the ${id} preset`, () => {
      expectConformance(v2AllPresetsProject, artboard, id);
    });
  }

  it('conforms for nested group parent and animated child', () => {
    const ab = v2NestedGroupProject.artboards[0];
    expectConformance(v2NestedGroupProject, ab, 'grp');
    expectConformance(v2NestedGroupProject, ab, 'child-text');
  });

  it('carries only the animation delta regardless of base rotation/opacity', () => {
    // The wrapper animates over document geometry (§4.2): its transform is the
    // pure animation delta, independent of the layer's own base rotation/opacity
    // (which live on the inner element). A base-rotated, semi-opaque layer must
    // still conform to the evaluator's identity-relative output.
    const rotated = structuredClone(v2AllPresetsProject);
    const ab = rotated.artboards[0];
    for (const l of ab.layers) {
      (l as { rotation: number }).rotation = 30;
      (l as { opacity: number }).opacity = 0.5;
    }
    expectConformance(rotated, ab, 'slide');
    expectConformance(rotated, ab, 'pop');
  });

  it('is locale-independent for shape geometry (en == fr CSS)', () => {
    const boxes = boxesFor(artboard);
    const build = (locale: string) => {
      const { clip } = compileClip({ projectId: v2AllPresetsProject.id, artboard, locale, fps: 30 });
      return compileAnimationCss({ clip, boxes, sceneDurationMs: 6000, scopeId: 'x' }).css;
    };
    expect(build('en')).toBe(build('fr'));
  });

  it('keeps every @keyframes inside the reduced-motion gate', () => {
    const boxes = boxesFor(artboard);
    const { clip } = compileClip({ projectId: v2AllPresetsProject.id, artboard, locale: 'en', fps: 30 });
    const { css } = compileAnimationCss({ clip, boxes, sceneDurationMs: 6000, scopeId: 'g' });
    const gateIndex = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    const firstKeyframes = css.indexOf('@keyframes');
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(firstKeyframes).toBeGreaterThan(gateIndex);
  });

  it('presents the downgrade warning in EN and FR', () => {
    const en = enEditor.export.htmlWarnings.codes.animationDowngrade;
    const fr = frEditor.export.htmlWarnings.codes.animationDowngrade;
    expect(en).toContain('{{name}}');
    expect(fr).toContain('{{name}}');
    expect(en).not.toBe(fr);
  });
});

/**
 * AN-3.5 text-reveal fragment conformance. Fragment CSS is a second
 * implementation of the same fragment IR the evaluator drives for MP4; this
 * samples both at identical timestamps for every fragment (parsing the emitted
 * per-fragment `@keyframes` back to numbers). The fragment compiler is gated off
 * in production, so these drive it directly rather than through `compileClip`.
 */
describe('AN-3.5 fragment CSS ↔ evaluator conformance', () => {
  const style: TextStyle = textStyleSchema.parse({ fontSize: 40, lineHeight: 1.4 });
  const fixed: TextMeasurer = { measure: (t) => t.length * 10 };
  const layer = { id: 'tx', type: 'text', x: 0, y: 0, w: 400, h: 200 } as unknown as CalqoLayer;

  function conform(kind: 'typewriter' | 'word-rise', text: string) {
    const sceneDurationMs = 4000;
    const compiled = compileFragmentAnimation({
      layer,
      preset: resolvePreset({ kind, duration: 1200, delay: 0 }),
      box: { w: layer.w, h: layer.h },
      sceneDuration: sceneDurationMs,
      measurer: fixed,
      text,
      style,
    });
    expect(compiled).not.toBeNull();
    const { css, bindings } = compileFragmentCss([compiled!], 30, sceneDurationMs, 's');
    const binding = bindings.get(layer.id);
    expect(binding).toBeDefined();

    binding!.classes.forEach((name, fi) => {
      if (!name) return; // fragment that never leaves identity
      const stops = parseKeyframes(css, name, sceneDurationMs);
      expect(stops.length).toBeGreaterThan(1);
      for (const stop of stops) {
        const o = evaluateFragment(compiled!.fragments[fi], stop.tMs);
        expect(stop.dx, `dx f${fi}@${stop.tMs}`).toBeCloseTo(o.dx, 1);
        expect(stop.dy, `dy f${fi}@${stop.tMs}`).toBeCloseTo(o.dy, 1);
        expect(Math.abs(stop.opacity - o.opacity), `op f${fi}@${stop.tMs}`).toBeLessThanOrEqual(FACTOR_TOL);
      }
    });
  }

  it('conforms for typewriter character fragments', () => {
    conform('typewriter', 'Hello');
  });

  it('conforms for word-rise word fragments', () => {
    conform('word-rise', 'one two three');
  });

  it('keeps fragment keyframes inside the reduced-motion gate', () => {
    const compiled = compileFragmentAnimation({
      layer,
      preset: resolvePreset({ kind: 'word-rise', duration: 1000, delay: 0 }),
      box: { w: layer.w, h: layer.h },
      sceneDuration: 4000,
      measurer: fixed,
      text: 'a b c',
      style,
    })!;
    const { css } = compileFragmentCss([compiled], 30, 4000, 'g');
    const gate = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    const firstKeyframes = css.indexOf('@keyframes');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(firstKeyframes).toBeGreaterThan(gate);
  });
});
