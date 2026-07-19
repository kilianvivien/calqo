import type { Easing } from '@/lib/schema';

/**
 * Pure easing functions mapping a clamped 0–1 input to an output. `linear`,
 * `ease-in`, `ease-out`, and `ease-in-out` stay within 0–1. `overshoot` and
 * `bounce` MAY exceed 0–1 mid-curve (overshoot goes past 1 near the end; both
 * start and end exactly at 0 and 1). Callers clamp property values to the
 * animatable range after interpolation — easing never clamps the value itself.
 */
export type EasingFn = (t: number) => number;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

const linear: EasingFn = (t) => t;
const easeIn: EasingFn = (t) => t * t;
const easeOut: EasingFn = (t) => t * (2 - t);
const easeInOut: EasingFn = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/** Back-style overshoot: passes above 1 before settling exactly at 1. */
const overshoot: EasingFn = (t) => {
  const s = 1.70158;
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
};

/** Penner bounce-out: settles at exactly 1 with decaying bounces. */
const bounce: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};

const EASING_FNS: Record<Easing, EasingFn> = {
  linear,
  'ease-in': easeIn,
  'ease-out': easeOut,
  'ease-in-out': easeInOut,
  overshoot,
  bounce,
};

export function getEasingFn(easing: Easing): EasingFn {
  return EASING_FNS[easing];
}

/** Apply an easing to a clamped-0–1 progress. */
export function applyEasing(easing: Easing, t: number): number {
  return EASING_FNS[easing](clamp01(t));
}
