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
 * Text reveals ship enabled (AN-3.5): the schema accepts them in the enter slot
 * for text/list layers and `TEXT_REVEALS_ENABLED` gates only the catalog/UI +
 * fragment compilation as a kill-switch. Fragments are supported on top-level
 * layers so live playback, MP4, and animated HTML all draw the same nodes.
 */

/** Per-character crisp reveal cap (ms): a short ramp reads as a typewriter cut
 * rather than a slow fade even when few characters share a long window. */
const TYPEWRITER_MAX_STEP_MS = 70;
/** Floor for the same ramp: below ~1 frame at 60 fps a glyph pops so hard it
 * reads as a strobe when a whole line lands at once. */
const TYPEWRITER_MIN_STEP_MS = 16;
/** Share of one cadence tick a glyph spends ramping in. */
const TYPEWRITER_STEP_FRACTION = 0.5;

/** Fraction of the word-rise window one word spends moving; the rest is stagger. */
const WORD_RISE_TRAVEL_FRACTION = 0.5;
const WORD_RISE_MIN_TRAVEL_MS = 180;
/** Cap on one word's travel. Without it a long reveal stretches every word into
 * the same slow drift; capped, extra duration becomes stagger and the line
 * cascades word by word however long it runs. */
const WORD_RISE_MAX_TRAVEL_MS = 700;
/** Share of a word's travel spent fading in: it is legible well before it has
 * finished settling, which reads far better than a fade over the full travel. */
const WORD_RISE_FADE_FRACTION = 0.6;
/** Scale a word lifts from, so the rise reads as depth rather than a slide. */
const WORD_RISE_START_SCALE = 0.94;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
 * (opacity 0) until its slice, ramps to 1 over a short step, then holds visible.
 *
 * Two things keep the rhythm right at any duration: the cadence counts the
 * spaces and line breaks between words (`TextFragment.tick`), so words are not
 * typed into each other; and the slice is sized so the *last* glyph lands
 * exactly on the window end, which makes `duration` mean "fully typed by then"
 * whether the text is five characters or five hundred. */
function compileTypewriter(chars: TextFragment[], preset: ResolvedPreset, sceneDuration: number): CompiledFragment[] {
  const n = chars.length;
  if (n === 0) return [];
  const start = Math.min(preset.delay, sceneDuration);
  const span = Math.max(0, Math.min(preset.duration, sceneDuration - start));
  const ticks = chars[n - 1].tick + 1;
  const step = Math.min(
    clamp((span / ticks) * TYPEWRITER_STEP_FRACTION, TYPEWRITER_MIN_STEP_MS, TYPEWRITER_MAX_STEP_MS),
    Math.max(span, 1),
  );
  const slice = ticks > 1 ? Math.max(0, span - step) / (ticks - 1) : 0;
  return chars.map((frag) => {
    const charStart = start + frag.tick * slice;
    const window: CompiledWindow = {
      start: charStart,
      // Never ramp past the scene end: a glyph cut short there would hold a
      // partial opacity for the rest of the scene.
      duration: Math.max(Math.min(step, sceneDuration - charStart), 1),
      tracks: [trackOf('opacity', [[0, 0], [1, 1]], 'linear')],
    };
    return fragmentFrom(frag, [window]);
  });
}

/** Compile word fragments into a staggered rise+fade. Words start in reading
 * order; the last word finishes exactly at the window end. One word's travel is
 * capped, so a longer duration buys more stagger rather than slower words. */
function compileWordRise(words: TextFragment[], preset: ResolvedPreset, style: TextStyle, sceneDuration: number): CompiledFragment[] {
  const n = words.length;
  if (n === 0) return [];
  const start = Math.min(preset.delay, sceneDuration);
  const span = Math.max(0, Math.min(preset.duration, sceneDuration - start));
  const travel = Math.min(
    clamp(span * WORD_RISE_TRAVEL_FRACTION, WORD_RISE_MIN_TRAVEL_MS, WORD_RISE_MAX_TRAVEL_MS),
    span,
  );
  const perWordDelay = n > 1 ? (span - travel) / (n - 1) : 0;
  const distance = riseDistance(style);
  const { easing } = preset;
  return words.map((frag) => {
    const wordStart = start + frag.index * perWordDelay;
    const window: CompiledWindow = {
      start: wordStart,
      duration: Math.max(travel, 1),
      tracks: [
        trackOf('dy', [[0, distance], [1, 0]], easing),
        trackOf('scaleX', [[0, WORD_RISE_START_SCALE], [1, 1]], easing),
        trackOf('scaleY', [[0, WORD_RISE_START_SCALE], [1, 1]], easing),
        // The fade resolves early and always eases out, whatever easing drives
        // the movement: an overshoot/bounce curve on opacity clamps at 0/1 and
        // makes a word flash on its way in.
        trackOf('opacity', [[0, 0], [WORD_RISE_FADE_FRACTION, 1], [1, 1]], 'ease-out'),
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
