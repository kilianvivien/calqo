import type { CalqoLayer, Easing, TextStyle } from '@/lib/schema';
import { resolvePreset, type ResolvedPreset } from './presets';
import {
  layoutText,
  type FragmentUnit,
  type TextFragment,
  type TextMeasurer,
} from './textLayout';
import type {
  CompiledFragment,
  CompiledFragmentAnimation,
  CompiledTrack,
  CompiledWindow,
} from './types';

/**
 * Fragment compiler for text-reveal presets (AN-3.5). Given a text/list layer's
 * *final* per-locale layout, it produces runtime-only per-fragment reveal
 * tracks: `typewriter` reveals character fragments in reading order; `word-rise`
 * lifts and fades in word fragments with a stagger. Both live in the enter slot.
 *
 * Fragments are never persisted (they depend on line layout, font metrics, and
 * locale — plan §4.3/§8). The compiled output feeds the same evaluator the
 * transform presets use, so live playback, MP4, and CSS/HTML all consume one IR.
 *
 * Gated: the schema rejects text-reveal kinds and `TEXT_REVEALS_ENABLED` is off
 * until cross-browser line-wrap/font-load behaviour is verified (plan §4.5). The
 * compiler is complete and tested so flipping the flag needs no new logic.
 */

/** Per-character crisp reveal cap (ms): a short ramp reads as a typewriter cut
 * rather than a slow fade even when few characters share a long window. */
const TYPEWRITER_MAX_STEP_MS = 80;
/** Fraction of the word-rise window one word spends moving; the rest is stagger. */
const WORD_RISE_TRAVEL_FRACTION = 0.5;
const WORD_RISE_MIN_TRAVEL_MS = 150;

function trackOf(prop: CompiledTrack['prop'], points: readonly [number, number][], easing: Easing): CompiledTrack {
  return {
    prop,
    keyframes: points.map(([t, value], i) => ({ t, value, easing: i === 0 ? 'linear' : easing })),
  };
}

/** Rise travel distance for word-rise, derived from font size and capped. */
function riseDistance(style: TextStyle): number {
  return Math.min(Math.max(style.fontSize * 0.9, 12), 120);
}

/** Compile character fragments into a typewriter reveal. Each glyph holds hidden
 * (opacity 0) until its slice, ramps to 1 over a short step, then holds visible. */
function compileTypewriter(chars: TextFragment[], preset: ResolvedPreset, sceneDuration: number): CompiledFragment[] {
  const n = chars.length;
  if (n === 0) return [];
  const start = Math.min(preset.delay, sceneDuration);
  const span = Math.min(preset.duration, sceneDuration - start);
  const slice = span / n;
  const step = Math.min(slice, TYPEWRITER_MAX_STEP_MS);
  return chars.map((frag) => {
    const charStart = start + frag.index * slice;
    const window: CompiledWindow = {
      start: charStart,
      duration: Math.max(step, 1),
      tracks: [trackOf('opacity', [[0, 0], [1, 1]], 'linear')],
    };
    return fragmentFrom(frag, [window]);
  });
}

/** Compile word fragments into a staggered rise+fade. Words start in reading
 * order; the last word finishes exactly at the window end. */
function compileWordRise(words: TextFragment[], preset: ResolvedPreset, style: TextStyle, sceneDuration: number): CompiledFragment[] {
  const n = words.length;
  if (n === 0) return [];
  const start = Math.min(preset.delay, sceneDuration);
  const span = Math.min(preset.duration, sceneDuration - start);
  const travel = Math.max(WORD_RISE_MIN_TRAVEL_MS, span * WORD_RISE_TRAVEL_FRACTION);
  const clampedTravel = Math.min(travel, span);
  const perWordDelay = n > 1 ? (span - clampedTravel) / (n - 1) : 0;
  const distance = riseDistance(style);
  const { easing } = preset;
  return words.map((frag) => {
    const wordStart = start + frag.index * perWordDelay;
    const window: CompiledWindow = {
      start: wordStart,
      duration: clampedTravel,
      tracks: [
        trackOf('dy', [[0, distance], [1, 0]], easing),
        trackOf('opacity', [[0, 0], [1, 1]], easing),
      ],
    };
    return fragmentFrom(frag, [window]);
  });
}

function fragmentFrom(frag: TextFragment, windows: CompiledWindow[]): CompiledFragment {
  return { x: frag.x, y: frag.y, w: frag.w, h: frag.h, text: frag.text, windows };
}

export interface FragmentCompileInput {
  layer: CalqoLayer;
  /** The resolved enter-slot text-reveal preset. */
  preset: ResolvedPreset;
  /** Layer box (w/h) in layer-local px. */
  box: { w: number; h: number };
  sceneDuration: number;
  measurer: TextMeasurer;
  text: string;
  style: TextStyle;
}

/** Compile one text/list layer's text-reveal enter preset into fragment
 * animation. Returns null when the layer carries no reveal-eligible text. */
export function compileFragmentAnimation(input: FragmentCompileInput): CompiledFragmentAnimation | null {
  const { layer, preset, box, sceneDuration, measurer, text, style } = input;
  const layout = layoutText(text, style, box, measurer);
  let unit: FragmentUnit;
  let fragments: CompiledFragment[];
  if (preset.kind === 'typewriter') {
    unit = 'char';
    fragments = compileTypewriter(layout.chars, preset, sceneDuration);
  } else if (preset.kind === 'word-rise') {
    unit = 'word';
    fragments = compileWordRise(layout.words, preset, style, sceneDuration);
  } else {
    return null;
  }
  if (fragments.length === 0) return null;
  return { layerId: layer.id, unit, fragments };
}

/** Whether a layer's enter slot is a text-reveal preset that the fragment
 * compiler owns. Reads the persisted preset instance directly; returns the
 * resolved preset for text/list layers only. */
export function textRevealEnterPreset(layer: CalqoLayer): ResolvedPreset | null {
  if (layer.type !== 'text' && layer.type !== 'list') return null;
  const anim = layer.animation;
  if (!anim || anim.mode !== 'preset' || !anim.enter) return null;
  const kind = anim.enter.kind;
  if (kind !== 'typewriter' && kind !== 'word-rise') return null;
  return resolvePreset(anim.enter);
}
