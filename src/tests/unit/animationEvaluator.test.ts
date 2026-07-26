import { describe, it, expect } from 'vitest';
import type { CalqoArtboard, LayerAnimation } from '@/lib/schema';
import { compileClip, type CompileClipInput } from '@/editor/animation/compiler';
import { applyEasing } from '@/editor/animation/easing';
import {
  evaluateLayer,
  evaluateClip,
  evaluateClipInto,
  createIdentityOverride,
} from '@/editor/animation/evaluator';
import type { CompiledClip, WrapperOverride } from '@/editor/animation/types';

function clipFor(animation: LayerAnimation, duration = 4000): CompiledClip {
  const artboard = {
    id: 'ab',
    name: 'a',
    preset: 'ig-square',
    width: 1080,
    height: 1080,
    background: { type: 'solid', color: '#ffffff' },
    timing: { duration },
    layers: [
      {
        id: 's',
        name: 's',
        type: 'shape',
        shape: 'rect',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: { type: 'solid', color: '#000000' },
        animation,
      },
    ],
  } as unknown as CalqoArtboard;
  const input: CompileClipInput = { projectId: 'p', artboard, locale: 'en', fps: 30 };
  return compileClip(input).clip;
}

describe('easing — golden values', () => {
  const samples = [0, 0.25, 0.5, 0.75, 1];
  it('linear', () => {
    expect(samples.map((t) => applyEasing('linear', t))).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it('ease-in', () => {
    expect(samples.map((t) => applyEasing('ease-in', t))).toEqual([0, 0.0625, 0.25, 0.5625, 1]);
  });
  it('ease-out', () => {
    expect(samples.map((t) => applyEasing('ease-out', t))).toEqual([0, 0.4375, 0.75, 0.9375, 1]);
  });
  it('ease-in-out', () => {
    expect(samples.map((t) => applyEasing('ease-in-out', t))).toEqual([0, 0.125, 0.5, 0.875, 1]);
  });
  it('overshoot passes above 1 but settles at exactly 0 and 1', () => {
    expect(applyEasing('overshoot', 0)).toBeCloseTo(0);
    expect(applyEasing('overshoot', 1)).toBeCloseTo(1);
    expect(applyEasing('overshoot', 0.8)).toBeGreaterThan(1);
  });
  it('bounce stays within 0–1 and settles at exactly 0 and 1', () => {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = applyEasing('bounce', Math.min(t, 1));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(applyEasing('bounce', 0)).toBeCloseTo(0);
    expect(applyEasing('bounce', 1)).toBeCloseTo(1);
  });
  it('clamps inputs outside 0–1', () => {
    expect(applyEasing('linear', -1)).toBe(0);
    expect(applyEasing('linear', 2)).toBe(1);
  });
});

describe('evaluator — enter fade timeline (§13 AN-0.1 boundaries)', () => {
  // enter fade delay 500 ms, duration 500 ms, scene 4000 ms.
  const clip = clipFor({ mode: 'preset', enter: { kind: 'fade', duration: 500, delay: 500 } });
  const op = (t: number) => evaluateLayer(clip, 's', t).opacity;

  it('holds the hidden start state before the enter window', () => {
    expect(op(0)).toBe(0);
    expect(op(499)).toBe(0);
  });
  it('interpolates within the window with the resolved easing (ease-out)', () => {
    // local t=0.5 → ease-out(0.5)=0.75
    expect(op(750)).toBeCloseTo(0.75);
  });
  it('reaches identity at the window end and holds it after', () => {
    expect(op(1000)).toBeCloseTo(1);
    expect(op(2000)).toBe(1);
    expect(op(4000)).toBe(1);
  });
});

describe('evaluator — exit fade holds hidden end state', () => {
  const clip = clipFor({ mode: 'preset', exit: { kind: 'fade', duration: 500, delay: 0 } }, 4000);
  const op = (t: number) => evaluateLayer(clip, 's', t).opacity;
  it('is identity before the exit window', () => {
    expect(op(0)).toBe(1);
    expect(op(3499)).toBe(1);
  });
  it('fades to 0 and holds hidden after the scene', () => {
    expect(op(4000)).toBeCloseTo(0);
    expect(op(5000)).toBe(0); // after scene: hold exit end
  });
});

describe('evaluator — composition and negatives', () => {
  it('composes additive translate/rotation and multiplicative scale', () => {
    const anim: LayerAnimation = {
      mode: 'custom',
      windows: [
        {
          start: 0,
          duration: 1000,
          tracks: [
            { prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 40 }] },
            { prop: 'rotation', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 90 }] },
            { prop: 'scaleX', keyframes: [{ t: 0, value: 1 }, { t: 1, value: 2 }] },
          ],
        },
      ],
    };
    const o = evaluateLayer(clipFor(anim), 's', 1000);
    expect(o.dx).toBeCloseTo(40);
    expect(o.rotation).toBeCloseTo(90);
    expect(o.scaleX).toBeCloseTo(2);
    expect(o.scaleY).toBe(1); // untouched prop stays identity
  });

  it('keeps full floating-point precision (no rounding in the evaluator)', () => {
    // Linear dx 0→300 over a 3000 ms window; at t=1000 the exact value is 100,
    // but at t=1 ms it is 0.1 and at 1/3 of the window it is a repeating decimal.
    const anim: LayerAnimation = {
      mode: 'custom',
      windows: [
        { start: 0, duration: 3000, tracks: [{ prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1, easing: 'linear' }] }] },
      ],
    };
    const clip = clipFor(anim);
    const v = evaluateLayer(clip, 's', 1000).dx; // lt = 1/3 → 1/3
    expect(v).toBeCloseTo(1 / 3, 12);
    expect(v).not.toBe(Number(v.toFixed(3))); // not pre-rounded
  });

  it('returns identity for negative time and for a missing layer id', () => {
    const clip = clipFor({ mode: 'preset', enter: { kind: 'pop', duration: 400, delay: 100 } });
    const before = evaluateLayer(clip, 's', -50);
    // pop enter hidden start: scale ~0.01, opacity 0
    expect(before.opacity).toBe(0);
    const missing = evaluateLayer(clip, 'does-not-exist', 500);
    expect(missing).toEqual(createIdentityOverride());
  });
});

describe('evaluator — sparse map, bulk reuse, and purity', () => {
  const anim: LayerAnimation = { mode: 'preset', enter: { kind: 'fade', duration: 500, delay: 0 } };
  const clip = clipFor(anim);

  it('evaluateClip omits identity layers', () => {
    // At t past the enter window, opacity is 1 (identity) → layer omitted.
    expect(evaluateClip(clip, 3000).size).toBe(0);
    // Mid-enter, opacity < 1 → present.
    expect(evaluateClip(clip, 250).size).toBe(1);
  });

  it('evaluateClipInto reuses the same override objects across frames', () => {
    const out = new Map<string, WrapperOverride>();
    evaluateClipInto(clip, 250, out);
    const ref = out.get('s')!;
    evaluateClipInto(clip, 400, out);
    expect(out.get('s')).toBe(ref); // same object, mutated in place
  });

  it('does not mutate the compiled clip', () => {
    const snapshot = JSON.stringify(clip);
    for (let i = 0; i <= 10; i++) evaluateLayer(clip, 's', i * 400);
    expect(JSON.stringify(clip)).toBe(snapshot);
  });

  it('evaluates an 1800-frame clip without producing non-finite output (diagnostic)', () => {
    const full = clipFor({
      mode: 'preset',
      enter: { kind: 'slide', duration: 500, delay: 0, direction: 'up', distance: 120 },
      emphasis: { kind: 'float', duration: 2000, delay: 0 },
      exit: { kind: 'fade', duration: 500, delay: 0 },
    }, 60000);
    const out = new Map<string, WrapperOverride>();
    for (let f = 0; f < 1800; f++) {
      evaluateClipInto(full, (f / 1800) * 60000, out);
      const o = out.get('s')!;
      expect(Number.isFinite(o.dx) && Number.isFinite(o.dy) && Number.isFinite(o.opacity)).toBe(true);
    }
  });
});
