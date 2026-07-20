import {
  DEFAULT_SCENE_DURATION_MS,
  type AnimProp,
  type CalqoArtboard,
  type CalqoLayer,
  type Easing,
  type LayerAnimation,
  type LocaleCode,
  type PresetInstance,
} from '@/lib/schema';
import {
  MIN_EMPHASIS_PERIOD_MS,
  TEXT_REVEALS_ENABLED,
  presetSupportsLayerKind,
  presetSupportsSlot,
  resolvePreset,
  type PresetLayerKind,
  type ResolvedPreset,
} from './presets';
import {
  COMPILER_VERSION,
  type CompiledFragmentAnimation,
  type CompiledLayerAnimation,
  type CompiledTrack,
  type CompiledWindow,
  type CompileIssue,
  type CompileResult,
  type WipeDirection,
} from './types';
import {
  compileFragmentAnimation,
  textRevealEnterPreset,
} from './fragmentCompiler';
import {
  fontShorthandFor,
  layerText,
  layerTextStyle,
  type TextMeasurer,
} from './textLayout';

/** A text reveal is a text-reveal enter preset kind (`typewriter`/`word-rise`);
 * the fragment compiler owns it, so the layer-level compiler skips its enter
 * window (fragments carry the reveal instead). */
function isTextRevealKind(kind: string): boolean {
  return kind === 'typewriter' || kind === 'word-rise';
}

/** Fixed blur radius applied by the `blur-in` preset (px). */
const BLUR_IN_PX = 16;
/** Pulse peak scale. */
const PULSE_SCALE = 1.1;
/** Wiggle peak rotation (deg). */
const WIGGLE_DEG = 6;

export interface CompileClipInput {
  projectId: string;
  artboard: CalqoArtboard;
  locale: LocaleCode;
  fps: number;
  /** Bumped when a webfont finishes loading; part of the cache key (§8). */
  fontRevision?: number;
  /**
   * Text-measurer factory for text-reveal fragment compilation (AN-3.5). Keyed by
   * the layer's CSS `font` shorthand. Injected (not imported) so the compiler
   * stays pure and unit-testable with a deterministic measurer; runtime callers
   * pass `createCanvasMeasurer`. When absent (or the feature flag is off), no
   * fragments are produced and every existing path is byte-identical.
   */
  measurerFor?: (fontShorthand: string) => TextMeasurer;
}

// ---------------------------------------------------------------------------
// Keyframe helpers
// ---------------------------------------------------------------------------

type Point = readonly [t: number, value: number];

/** Build a track; easing is applied to every keyframe after the first (easing
 * describes the segment *into* a keyframe). */
function track(prop: AnimProp, points: Point[], easing: Easing): CompiledTrack {
  return {
    prop,
    keyframes: points.map(([t, value], i) => ({
      t,
      value,
      easing: i === 0 ? 'linear' : easing,
    })),
  };
}

/** Unit direction vector in artboard coords: `up`/`left` are negative. */
function directionVector(dir: WipeDirection): readonly [number, number] {
  switch (dir) {
    case 'up':
      return [0, -1];
    case 'down':
      return [0, 1];
    case 'left':
      return [-1, 0];
    case 'right':
      return [1, 0];
  }
}

/** Enter/exit translate tracks for slide/rise. `enter` travels from an offset
 * opposite the direction to rest; `exit` travels from rest to an offset along
 * the direction. Only the non-zero axis emits a track. */
function translateTracks(
  slot: 'enter' | 'exit',
  dir: WipeDirection,
  distance: number,
  easing: Easing,
): CompiledTrack[] {
  const [vx, vy] = directionVector(dir);
  const tracks: CompiledTrack[] = [];
  const axis = (prop: 'dx' | 'dy', v: number) => {
    if (v === 0) return;
    const off = v * distance;
    tracks.push(
      slot === 'enter'
        ? track(prop, [[0, -off], [1, 0]], easing)
        : track(prop, [[0, 0], [1, off]], easing),
    );
  };
  axis('dx', vx);
  axis('dy', vy);
  return tracks;
}

/** Keyframes for one enter/exit preset window. */
function presetTracks(
  slot: 'enter' | 'exit',
  preset: ResolvedPreset,
): { tracks: CompiledTrack[]; wipeDirection?: WipeDirection } {
  const { easing } = preset;
  const fadeIn: Point[] = [[0, 0], [1, 1]];
  const fadeOut: Point[] = [[0, 1], [1, 0]];
  switch (preset.kind) {
    case 'fade':
      return { tracks: [track('opacity', slot === 'enter' ? fadeIn : fadeOut, easing)] };
    case 'slide':
      return {
        tracks: translateTracks(slot, preset.direction, preset.distance, easing),
      };
    case 'rise':
      return {
        tracks: [
          ...translateTracks(slot, preset.direction, preset.distance, easing),
          track('opacity', slot === 'enter' ? fadeIn : fadeOut, easing),
        ],
      };
    case 'pop': {
      const scale: Point[] =
        slot === 'enter' ? [[0, 0.01], [1, 1]] : [[0, 1], [1, 0.01]];
      return {
        tracks: [
          track('scaleX', scale, easing),
          track('scaleY', scale, easing),
          track('opacity', slot === 'enter' ? fadeIn : fadeOut, easing),
        ],
      };
    }
    case 'wipe':
      return {
        tracks: [
          track('wipe-progress', slot === 'enter' ? [[0, 0], [1, 1]] : [[0, 1], [1, 0]], easing),
        ],
        wipeDirection: preset.direction,
      };
    case 'blur-in': {
      const blur: Point[] =
        slot === 'enter' ? [[0, BLUR_IN_PX], [1, 0]] : [[0, 0], [1, BLUR_IN_PX]];
      return {
        tracks: [
          track('blur', blur, easing),
          track('opacity', slot === 'enter' ? fadeIn : fadeOut, easing),
        ],
      };
    }
    default:
      // Emphasis / text kinds never reach here.
      return { tracks: [] };
  }
}

/** Tile a one-loop shape (first and last keyframe at identity) `n` times across
 * the normalized window so it fills exactly and settles to identity, regardless
 * of whether the window is a whole multiple of the requested period. */
function tileLoop(prop: AnimProp, loop: Point[], n: number, easing: Easing): CompiledTrack {
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < loop.length; k++) {
      // Skip each loop's starting keyframe except the very first, so times are
      // strictly increasing at loop seams.
      if (i > 0 && k === 0) continue;
      const [lt, lv] = loop[k];
      points.push([(i + lt) / n, lv]);
    }
  }
  return track(prop, points, easing);
}

/** Number of emphasis loops for a window: near the requested period but capped
 * so the loop frequency never exceeds the photosensitivity limit. */
function emphasisLoopCount(windowMs: number, periodMs: number): number {
  const requested = Math.max(1, Math.round(windowMs / periodMs));
  const maxByFrequency = Math.max(1, Math.floor(windowMs / MIN_EMPHASIS_PERIOD_MS));
  return Math.min(requested, maxByFrequency);
}

function emphasisTracks(preset: ResolvedPreset, windowMs: number): CompiledTrack[] {
  const n = emphasisLoopCount(windowMs, preset.duration);
  const { easing } = preset;
  switch (preset.kind) {
    case 'pulse': {
      const loop: Point[] = [[0, 1], [0.5, PULSE_SCALE], [1, 1]];
      return [tileLoop('scaleX', loop, n, easing), tileLoop('scaleY', loop, n, easing)];
    }
    case 'wiggle': {
      const loop: Point[] = [[0, 0], [0.25, WIGGLE_DEG], [0.75, -WIGGLE_DEG], [1, 0]];
      return [tileLoop('rotation', loop, n, easing)];
    }
    case 'float': {
      const loop: Point[] = [[0, 0], [0.5, -preset.distance], [1, 0]];
      return [tileLoop('dy', loop, n, easing)];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Layer compilation
// ---------------------------------------------------------------------------

function compilePresetAnimation(
  layerId: string,
  layerKind: PresetLayerKind,
  anim: Extract<LayerAnimation, { mode: 'preset' }>,
  sceneDuration: number,
  issues: CompileIssue[],
): CompiledWindow[] {
  const windows: CompiledWindow[] = [];

  const guard = (slot: 'enter' | 'emphasis' | 'exit', inst: PresetInstance): boolean => {
    if (!presetSupportsSlot(inst.kind, slot)) {
      issues.push({
        layerId,
        slot,
        code: 'unsupported-slot',
        message: `${inst.kind} cannot be used as ${slot}`,
      });
      return false;
    }
    if (!presetSupportsLayerKind(inst.kind, layerKind)) {
      issues.push({
        layerId,
        slot,
        code: 'unsupported-preset-kind',
        message: `${inst.kind} does not support ${layerKind} layers`,
      });
      return false;
    }
    return true;
  };

  // Enter window: anchored at scene start. Text-reveal kinds are owned by the
  // fragment compiler, so they contribute no layer-level enter window here.
  let enterEnd = 0;
  if (anim.enter && !isTextRevealKind(anim.enter.kind) && guard('enter', anim.enter)) {
    const p = resolvePreset(anim.enter);
    const start = p.delay;
    const end = start + p.duration;
    if (end > sceneDuration) {
      issues.push({
        layerId,
        slot: 'enter',
        code: 'window-exceeds-scene',
        message: `enter ends at ${end}ms, after the ${sceneDuration}ms scene`,
      });
    }
    enterEnd = Math.min(end, sceneDuration);
    const { tracks, wipeDirection } = presetTracks('enter', p);
    windows.push({ start: Math.min(start, sceneDuration), duration: enterEnd - Math.min(start, sceneDuration), tracks, wipeDirection });
  }

  // Exit window: anchored at scene end.
  let exitStart = sceneDuration;
  if (anim.exit && guard('exit', anim.exit)) {
    const p = resolvePreset(anim.exit);
    const end = sceneDuration - p.delay;
    const start = end - p.duration;
    if (start < 0) {
      issues.push({
        layerId,
        slot: 'exit',
        code: 'window-exceeds-scene',
        message: `exit would start at ${start}ms, before the scene`,
      });
    }
    exitStart = Math.max(start, 0);
    const { tracks, wipeDirection } = presetTracks('exit', p);
    windows.push({ start: exitStart, duration: Math.max(end, exitStart) - exitStart, tracks, wipeDirection });
  }

  // Enter/exit share props (opacity, translate …); overlapping in time is
  // forbidden by construction, so flag it rather than silently blend.
  if (anim.enter && anim.exit && enterEnd > exitStart) {
    issues.push({
      layerId,
      code: 'slot-window-overlap',
      message: `enter ends at ${enterEnd}ms but exit starts at ${exitStart}ms`,
    });
  }

  // Emphasis window: the hold between enter and exit; loops end at exit anchor.
  if (anim.emphasis && guard('emphasis', anim.emphasis)) {
    const p = resolvePreset(anim.emphasis);
    const start = Math.min(enterEnd + p.delay, sceneDuration);
    const end = exitStart;
    const duration = end - start;
    if (duration > 0) {
      windows.push({ start, duration, tracks: emphasisTracks(p, duration) });
    }
  }

  return windows;
}

function compileCustomAnimation(
  anim: Extract<LayerAnimation, { mode: 'custom' }>,
): CompiledWindow[] {
  return anim.windows.map((w) => ({
    start: w.start,
    duration: w.duration,
    tracks: w.tracks.map((t) => ({
      prop: t.prop,
      keyframes: t.keyframes.map((kf, i) => ({
        t: kf.t,
        value: kf.value,
        easing: kf.easing ?? (i === 0 ? 'linear' : 'ease-in-out'),
      })),
    })),
  }));
}

function compileLayer(
  layer: CalqoLayer,
  sceneDuration: number,
  out: CompiledLayerAnimation[],
  issues: CompileIssue[],
): void {
  if (layer.animation) {
    const windows =
      layer.animation.mode === 'preset'
        ? compilePresetAnimation(
            layer.id,
            layer.type,
            layer.animation,
            sceneDuration,
            issues,
          )
        : compileCustomAnimation(layer.animation);
    if (windows.length > 0) out.push({ layerId: layer.id, windows });
  }
  if (layer.type === 'group') {
    for (const child of layer.children) {
      compileLayer(child, sceneDuration, out, issues);
    }
  }
}

/** Compile a top-level layer's text-reveal enter preset into fragment animation.
 * Runs only when the feature flag is on and a measurer factory is supplied.
 *
 * Fragments are supported on **top-level** text/list layers only, so every
 * renderer (live Konva, offscreen MP4, HTML/CSS) draws the same per-fragment
 * nodes — a text layer nested inside a group is not split into fragments (its
 * reveal preset is a no-op there; author it at the top level). */
function compileFragments(
  layer: CalqoLayer,
  sceneDuration: number,
  locale: LocaleCode,
  measurerFor: (fontShorthand: string) => TextMeasurer,
  out: CompiledFragmentAnimation[],
): void {
  const preset = textRevealEnterPreset(layer);
  if (!preset) return;
  const text = layerText(layer, locale);
  const style = layerTextStyle(layer);
  if (text === null || !style) return;
  const fragmentAnim = compileFragmentAnimation({
    layer,
    preset,
    box: { w: layer.w, h: layer.h },
    sceneDuration,
    measurer: measurerFor(fontShorthandFor(style)),
    text,
    style,
  });
  if (fragmentAnim) out.push(fragmentAnim);
}

/** Compile an artboard's preset/custom animation into a deterministic
 * {@link CompiledClip}. Pure: same input → structurally identical output. */
export function compileClip(input: CompileClipInput): CompileResult {
  const sceneDuration = input.artboard.timing?.duration ?? DEFAULT_SCENE_DURATION_MS;
  const layers: CompiledLayerAnimation[] = [];
  const issues: CompileIssue[] = [];
  for (const layer of input.artboard.layers) {
    compileLayer(layer, sceneDuration, layers, issues);
  }

  const fragments: CompiledFragmentAnimation[] = [];
  if (TEXT_REVEALS_ENABLED && input.measurerFor) {
    for (const layer of input.artboard.layers) {
      compileFragments(layer, sceneDuration, input.locale, input.measurerFor, fragments);
    }
  }

  const clip: CompileResult['clip'] = {
    sceneDuration,
    fps: input.fps,
    layers,
    compilerVersion: COMPILER_VERSION,
  };
  if (fragments.length > 0) clip.fragments = fragments;
  return { clip, issues };
}

// ---------------------------------------------------------------------------
// Bounded, explicitly-invalidated cache (§4.1 / §8)
//
// Keyed only on compilation inputs. Object identity is never used because Immer
// replaces object branches on every edit; the key is a content signature so an
// irrelevant edit (e.g. project rename) is a cache hit while any layout-
// affecting change is a miss.
// ---------------------------------------------------------------------------

const MAX_CACHE_ENTRIES = 32;
const cache = new Map<string, CompileResult>();

/** Reduced, order-stable signature of the inputs that can change compiled
 * output (or that §8 requires to invalidate: geometry, style, content, font). */
function layerSignature(layer: CalqoLayer): unknown {
  const base = {
    id: layer.id,
    type: layer.type,
    x: layer.x,
    y: layer.y,
    w: layer.w,
    h: layer.h,
    rotation: layer.rotation,
    visible: layer.visible,
    animation: layer.animation ?? null,
  };
  if (layer.type === 'text') {
    return { ...base, text: layer.text, style: layer.style };
  }
  if (layer.type === 'list') {
    return { ...base, items: layer.items, style: layer.style };
  }
  if (layer.type === 'group') {
    return { ...base, children: layer.children.map(layerSignature) };
  }
  return base;
}

export function clipCacheKey(input: CompileClipInput): string {
  const signature = {
    v: COMPILER_VERSION,
    artboardId: input.artboard.id,
    locale: input.locale,
    fps: input.fps,
    fontRevision: input.fontRevision ?? 0,
    // Whether this compile produces text-reveal fragments (§4.5 gate). Keeps a
    // fragment-producing compile from sharing a cache entry with one that isn't.
    reveals: TEXT_REVEALS_ENABLED && !!input.measurerFor,
    timing: input.artboard.timing ?? null,
    layers: input.artboard.layers.map(layerSignature),
  };
  return `${input.projectId}::${JSON.stringify(signature)}`;
}

/** Compile with memoization. The cache is bounded (LRU) and only invalidated
 * through the explicit APIs below. */
export function compileClipCached(input: CompileClipInput): CompileResult {
  const key = clipCacheKey(input);
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const result = compileClip(input);
  cache.set(key, result);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return result;
}

/** Drop every cached clip (e.g. on compiler upgrade in dev, or project close). */
export function invalidateClipCache(): void {
  cache.clear();
}

/** Drop cached clips for one project (e.g. on project replacement/import). */
export function invalidateProjectClips(projectId: string): void {
  const prefix = `${projectId}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Current cache size — for tests/diagnostics only. */
export function clipCacheSize(): number {
  return cache.size;
}
