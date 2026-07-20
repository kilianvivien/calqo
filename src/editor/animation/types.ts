import type { AnimProp, Easing } from '@/lib/schema';

/**
 * Runtime-only animation types. None of these are persisted — they are the
 * compiled form of the preset/custom document produced deterministically at
 * load/edit/export time (docs/calqo-animation-extension-plan.md §4.1). The
 * persisted contract lives in `src/lib/schema/`.
 */

/** Bumped whenever compiled output for the same input could change. Part of the
 * cache key so stale compiled clips are never served across a compiler change. */
export const COMPILER_VERSION = 1 as const;

/** The wrapper-node identity: transforms compose over this (§4.2). */
export interface WrapperOverride {
  /** Additive px offset from document x. */
  dx: number;
  /** Additive px offset from document y. */
  dy: number;
  /** Multiplicative scale around the layer center. */
  scaleX: number;
  scaleY: number;
  /** Additive degrees around the layer center. */
  rotation: number;
  /** Multiplies document opacity. */
  opacity: number;
  /** Clip reveal 0 (hidden) → 1 (fully revealed). */
  wipeProgress: number;
  /** Blur radius in px (0 = none). */
  blur: number;
  /** Reveal edge for a wipe, when `wipeProgress < 1`. */
  wipeDirection?: WipeDirection;
}

export type WipeDirection = 'up' | 'down' | 'left' | 'right';

/** Identity override — a layer at rest composes to its document geometry. */
export const IDENTITY_OVERRIDE: Readonly<WrapperOverride> = Object.freeze({
  dx: 0,
  dy: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  wipeProgress: 1,
  blur: 0,
});

export interface CompiledKeyframe {
  /** 0–1, normalized within the owning window. */
  t: number;
  value: number;
  /** Easing into this keyframe (defaults resolved at compile time). */
  easing: Easing;
}

export interface CompiledTrack {
  prop: AnimProp;
  keyframes: CompiledKeyframe[];
}

export interface CompiledWindow {
  /** ms from scene start. */
  start: number;
  /** ms, > 0. */
  duration: number;
  tracks: CompiledTrack[];
  /** Reveal edge carried for wipe tracks (renderer hint). */
  wipeDirection?: WipeDirection;
}

export interface CompiledLayerAnimation {
  layerId: string;
  windows: CompiledWindow[];
}

/** The unit a text reveal animates (mirrors `textLayout.FragmentUnit`; kept here
 * so runtime types have no import from the layout module). */
export type FragmentUnit = 'word' | 'char';

/** One laid-out text fragment (a word or a glyph) with its box relative to the
 * layer's top-left and its own reveal windows. Runtime-only, like every other
 * type here — fragments depend on line layout and are never persisted (§4.3). */
export interface CompiledFragment {
  /** Box in unrotated layer-local coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  windows: CompiledWindow[];
}

/** Text-reveal animation for one layer, produced by the fragment compiler
 * (AN-3.5). Sits alongside {@link CompiledLayerAnimation}: a text layer can carry
 * both layer-level windows (emphasis/exit) and fragment reveals (typewriter /
 * word-rise in the enter slot). */
export interface CompiledFragmentAnimation {
  layerId: string;
  unit: FragmentUnit;
  fragments: CompiledFragment[];
}

/** The fully compiled clip: everything the evaluator needs, nothing persisted. */
export interface CompiledClip {
  sceneDuration: number;
  fps: number;
  layers: CompiledLayerAnimation[];
  /** Per-layer text-reveal fragments (AN-3.5). Present only when a layer has an
   * enabled text-reveal enter preset; empty/absent for every static or
   * transform-only clip, so non-text paths are unaffected. */
  fragments?: CompiledFragmentAnimation[];
  compilerVersion: number;
}

/** A structured problem found while compiling (unsupported combo, overlap …). */
export interface CompileIssue {
  layerId: string;
  slot?: 'enter' | 'emphasis' | 'exit';
  code:
    | 'unsupported-preset-kind'
    | 'unsupported-slot'
    | 'slot-window-overlap'
    | 'window-exceeds-scene';
  message: string;
}

export interface CompileResult {
  clip: CompiledClip;
  issues: CompileIssue[];
}
