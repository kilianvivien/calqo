import { applyEasing } from './easing';
import {
  IDENTITY_OVERRIDE,
  type CompiledClip,
  type CompiledKeyframe,
  type CompiledLayerAnimation,
  type CompiledTrack,
  type WipeDirection,
  type WrapperOverride,
} from './types';
import { ANIM_CAPS, type AnimProp } from '@/lib/schema';

/**
 * Pure evaluator: `(compiledClip, tMs) → per-layer wrapper overrides`. It is the
 * single source of truth for live playback and MP4/GIF frame rendering
 * (docs/calqo-animation-extension-plan.md §6.2). Composition rules (§4.2):
 * dx/dy/rotation are additive, scaleX/scaleY/opacity multiplicative, and
 * wipe-progress/blur are dedicated reveal props.
 *
 * Per-property timeline semantics (§13 AN-0.1) fall out of a piecewise "hold"
 * model: before a property's first window it holds that window's start value
 * (a preset's hidden entry state); after its last window it holds that window's
 * end value (a preset's hidden exit state); in the gaps it holds the previous
 * window's end value. Because enter/emphasis/exit windows all begin and end at
 * identity, gaps evaluate to identity automatically.
 */

/** A fresh, mutable identity override. */
export function createIdentityOverride(): WrapperOverride {
  return { ...IDENTITY_OVERRIDE };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate one track at a normalized window time `lt` (0–1). Bounded lookup
 * (binary search), no per-call allocation. */
function valueAtLocal(track: CompiledTrack, lt: number): number {
  const kfs = track.keyframes;
  if (lt <= kfs[0].t) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (lt >= last.t) return last.value;
  let lo = 0;
  let hi = kfs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].t <= lt) lo = mid;
    else hi = mid;
  }
  const a = kfs[lo];
  const b: CompiledKeyframe = kfs[hi];
  const span = b.t - a.t;
  const progress = span <= 0 ? 0 : (lt - a.t) / span;
  return lerp(a.value, b.value, applyEasing(b.easing, progress));
}

interface Segment {
  start: number;
  end: number;
  track: CompiledTrack;
  wipeDirection?: WipeDirection;
}

/** Evaluate one property's piecewise-hold timeline at absolute time `tMs`. */
function evalPropAt(segments: Segment[], tMs: number): number {
  let lastEnd: number | undefined;
  for (const seg of segments) {
    if (tMs <= seg.end) {
      if (tMs >= seg.start) {
        const dur = seg.end - seg.start;
        const lt = dur <= 0 ? 1 : (tMs - seg.start) / dur;
        return valueAtLocal(seg.track, lt);
      }
      // Before this segment: hold the previous window's end (gap) or, if this is
      // the first segment, this window's start value.
      return lastEnd ?? valueAtLocal(seg.track, 0);
    }
    lastEnd = valueAtLocal(seg.track, 1);
  }
  // After every segment: hold the last window's end value.
  return lastEnd ?? 0;
}

/** Build per-property segment lists for a compiled layer, sorted by start. */
function segmentsByProp(
  layerAnim: CompiledLayerAnimation,
): Map<AnimProp, Segment[]> {
  const byProp = new Map<AnimProp, Segment[]>();
  for (const window of layerAnim.windows) {
    const end = window.start + window.duration;
    for (const track of window.tracks) {
      const seg: Segment = {
        start: window.start,
        end,
        track,
        wipeDirection: window.wipeDirection,
      };
      const list = byProp.get(track.prop);
      if (list) list.push(seg);
      else byProp.set(track.prop, [seg]);
    }
  }
  for (const list of byProp.values()) {
    list.sort((a, b) => a.start - b.start);
  }
  return byProp;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Compose one property value into a mutable override per §4.2 rules. */
function applyProp(
  out: WrapperOverride,
  prop: AnimProp,
  value: number,
  wipeDirection: WipeDirection | undefined,
): void {
  switch (prop) {
    case 'dx':
      out.dx += value;
      break;
    case 'dy':
      out.dy += value;
      break;
    case 'rotation':
      out.rotation += value;
      break;
    case 'scaleX':
      out.scaleX *= clamp(value, 1e-4, ANIM_CAPS.scale);
      break;
    case 'scaleY':
      out.scaleY *= clamp(value, 1e-4, ANIM_CAPS.scale);
      break;
    case 'opacity':
      out.opacity *= clamp(value, 0, 1);
      break;
    case 'wipe-progress':
      out.wipeProgress = clamp(value, 0, 1);
      if (out.wipeProgress < 1 && wipeDirection) out.wipeDirection = wipeDirection;
      break;
    case 'blur':
      out.blur = clamp(value, 0, ANIM_CAPS.blur);
      break;
  }
}

/** Evaluate one compiled layer into a caller-owned override object, which is
 * reset to identity first. Deleted/absent layers leave the object at identity. */
export function evaluateLayerInto(
  layerAnim: CompiledLayerAnimation | undefined,
  tMs: number,
  out: WrapperOverride,
): WrapperOverride {
  out.dx = 0;
  out.dy = 0;
  out.scaleX = 1;
  out.scaleY = 1;
  out.rotation = 0;
  out.opacity = 1;
  out.wipeProgress = 1;
  out.blur = 0;
  out.wipeDirection = undefined;
  if (!layerAnim) return out;
  const byProp = segmentsByProp(layerAnim);
  for (const [prop, segments] of byProp) {
    applyProp(out, prop, evalPropAt(segments, tMs), segments[0]?.wipeDirection);
  }
  return out;
}

/** Allocation-friendly single-layer evaluation (tests / one-off reads). Returns
 * identity when the layer id is not in the clip. */
export function evaluateLayer(
  clip: CompiledClip,
  layerId: string,
  tMs: number,
): WrapperOverride {
  const layerAnim = clip.layers.find((l) => l.layerId === layerId);
  return evaluateLayerInto(layerAnim, tMs, createIdentityOverride());
}

function isIdentity(o: WrapperOverride): boolean {
  return (
    o.dx === 0 &&
    o.dy === 0 &&
    o.scaleX === 1 &&
    o.scaleY === 1 &&
    o.rotation === 0 &&
    o.opacity === 1 &&
    o.wipeProgress === 1 &&
    o.blur === 0
  );
}

/** Evaluate every animated layer at `tMs`, returning only layers whose override
 * differs from identity. Allocates a Map and fresh overrides — suited to
 * one-off reads, not the export hot path (use {@link evaluateClipInto}). */
export function evaluateClip(
  clip: CompiledClip,
  tMs: number,
): Map<string, WrapperOverride> {
  const result = new Map<string, WrapperOverride>();
  for (const layerAnim of clip.layers) {
    const override = evaluateLayerInto(layerAnim, tMs, createIdentityOverride());
    if (!isIdentity(override)) result.set(layerAnim.layerId, override);
  }
  return result;
}

/** Bulk evaluation for the export/playback hot path: reuses one override object
 * per layer id across frames instead of allocating. Every animated layer id gets
 * an entry (reset to identity then composed); returns the same map. */
export function evaluateClipInto(
  clip: CompiledClip,
  tMs: number,
  out: Map<string, WrapperOverride>,
): Map<string, WrapperOverride> {
  for (const layerAnim of clip.layers) {
    let override = out.get(layerAnim.layerId);
    if (!override) {
      override = createIdentityOverride();
      out.set(layerAnim.layerId, override);
    }
    evaluateLayerInto(layerAnim, tMs, override);
  }
  return out;
}
