import {
  ANIM_CAPS,
  DEFERRED_PRESET_KINDS,
  EMPHASIS_PRESET_KINDS,
  ENTER_EXIT_PRESET_KINDS,
  type Easing,
  type PresetInstance,
  type PresetKind,
} from '@/lib/schema';

/** Animation slot a preset can occupy. */
export type PresetSlot = 'enter' | 'emphasis' | 'exit';
export type PresetDirection = 'up' | 'down' | 'left' | 'right';

/** Layer kinds a preset applies to. Every v1 preset works on every layer kind
 * (text reveals, which are layout-dependent, are deferred to AN-3). */
export type PresetLayerKind =
  | 'text'
  | 'shape'
  | 'image'
  | 'svg'
  | 'list'
  | 'group';

/** Static metadata for a preset kind — the single source the UI and compiler
 * both read, so preset knowledge is never duplicated in JSX or the compiler. */
export interface PresetMeta {
  kind: PresetKind;
  slots: readonly PresetSlot[];
  /** Reads a `direction` (slide / wipe / rise). */
  directional: boolean;
  /** Reads a `distance` (slide / rise / float travel). */
  usesDistance: boolean;
  /** Emphasis loops that must settle to identity at the window end. */
  repeats: boolean;
  allowedLayerKinds: readonly PresetLayerKind[] | 'all';
  defaults: {
    duration: number;
    delay: number;
    direction?: PresetDirection;
    distance?: number;
    easing: Easing;
  };
}

const ALL_KINDS: readonly PresetLayerKind[] | 'all' = 'all';

/** Minimum emphasis loop period in ms — caps repeat frequency at ~3 Hz to stay
 * inside photosensitivity limits (plan §9). */
export const MIN_EMPHASIS_PERIOD_MS = 334;

export const PRESET_CATALOG: Record<PresetKind, PresetMeta> = {
  // --- enter / exit ---------------------------------------------------------
  fade: {
    kind: 'fade',
    slots: ['enter', 'exit'],
    directional: false,
    usesDistance: false,
    repeats: false,
    allowedLayerKinds: ALL_KINDS,
    defaults: { duration: 500, delay: 0, easing: 'ease-out' },
  },
  slide: {
    kind: 'slide',
    slots: ['enter', 'exit'],
    directional: true,
    usesDistance: true,
    repeats: false,
    allowedLayerKinds: ALL_KINDS,
    defaults: {
      duration: 600,
      delay: 0,
      direction: 'up',
      distance: 120,
      easing: 'ease-out',
    },
  },
  pop: {
    kind: 'pop',
    slots: ['enter', 'exit'],
    directional: false,
    usesDistance: false,
    repeats: false,
    allowedLayerKinds: ALL_KINDS,
    defaults: { duration: 500, delay: 0, easing: 'overshoot' },
  },
  rise: {
    kind: 'rise',
    slots: ['enter', 'exit'],
    directional: true,
    usesDistance: true,
    repeats: false,
    allowedLayerKinds: ALL_KINDS,
    defaults: {
      duration: 600,
      delay: 0,
      direction: 'up',
      distance: 80,
      easing: 'ease-out',
    },
  },
  wipe: {
    kind: 'wipe',
    slots: ['enter', 'exit'],
    directional: true,
    usesDistance: false,
    repeats: false,
    allowedLayerKinds: ALL_KINDS,
    defaults: { duration: 600, delay: 0, direction: 'left', easing: 'ease-in-out' },
  },
  'blur-in': {
    kind: 'blur-in',
    slots: ['enter', 'exit'],
    directional: false,
    usesDistance: false,
    repeats: false,
    allowedLayerKinds: ALL_KINDS,
    defaults: { duration: 600, delay: 0, easing: 'ease-out' },
  },
  // --- emphasis -------------------------------------------------------------
  pulse: {
    kind: 'pulse',
    slots: ['emphasis'],
    directional: false,
    usesDistance: false,
    repeats: true,
    allowedLayerKinds: ALL_KINDS,
    defaults: { duration: 900, delay: 0, easing: 'ease-in-out' },
  },
  wiggle: {
    kind: 'wiggle',
    slots: ['emphasis'],
    directional: false,
    usesDistance: false,
    repeats: true,
    allowedLayerKinds: ALL_KINDS,
    defaults: { duration: 700, delay: 0, easing: 'ease-in-out' },
  },
  float: {
    kind: 'float',
    slots: ['emphasis'],
    directional: false,
    usesDistance: true,
    repeats: true,
    allowedLayerKinds: ALL_KINDS,
    defaults: { duration: 2000, delay: 0, distance: 16, easing: 'ease-in-out' },
  },
  // --- text (reserved, not enabled in v1) -----------------------------------
  typewriter: {
    kind: 'typewriter',
    slots: ['enter'],
    directional: false,
    usesDistance: false,
    repeats: false,
    allowedLayerKinds: ['text', 'list'],
    defaults: { duration: 1200, delay: 0, easing: 'linear' },
  },
  'word-rise': {
    kind: 'word-rise',
    slots: ['enter'],
    directional: false,
    usesDistance: false,
    repeats: false,
    allowedLayerKinds: ['text', 'list'],
    defaults: { duration: 1200, delay: 0, easing: 'ease-out' },
  },
};

/**
 * Text-reveal presets (`typewriter`, `word-rise`) stay gated (AN-3.5). They need
 * a runtime fragment compiler driven by final per-locale line layout and font
 * metrics — not yet built — and must stay behind this flag until line-wrap and
 * font-load behavior is stable across Chrome/Safari/WKWebView (plan §4.5, §8,
 * AN-3.5). The schema also rejects these kinds (`DEFERRED_PRESET_KINDS`), so the
 * gate holds at both the document and catalog layers. */
export const TEXT_REVEALS_ENABLED = false as const;

/** Preset kinds usable in v1 (text reveals excluded while gated — see above). */
export const ENABLED_PRESET_KINDS: readonly PresetKind[] = [
  ...ENTER_EXIT_PRESET_KINDS,
  ...EMPHASIS_PRESET_KINDS,
  ...(TEXT_REVEALS_ENABLED ? DEFERRED_PRESET_KINDS : []),
];

export function getPresetMeta(kind: PresetKind): PresetMeta {
  return PRESET_CATALOG[kind];
}

export function isPresetEnabled(kind: PresetKind): boolean {
  return ENABLED_PRESET_KINDS.includes(kind);
}

export function presetSupportsSlot(kind: PresetKind, slot: PresetSlot): boolean {
  return PRESET_CATALOG[kind].slots.includes(slot);
}

export function presetSupportsLayerKind(
  kind: PresetKind,
  layerKind: PresetLayerKind,
): boolean {
  const allowed = PRESET_CATALOG[kind].allowedLayerKinds;
  return allowed === 'all' || allowed.includes(layerKind);
}

/** A preset instance with defaults filled and parameters clamped to the
 * validated caps, so downstream compilation never produces out-of-range tracks. */
export interface ResolvedPreset {
  kind: PresetKind;
  duration: number;
  delay: number;
  direction: PresetDirection;
  distance: number;
  easing: Easing;
  stagger: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Fill preset defaults and clamp every knob to its cap. */
export function resolvePreset(instance: PresetInstance): ResolvedPreset {
  const meta = PRESET_CATALOG[instance.kind];
  return {
    kind: instance.kind,
    duration: clamp(instance.duration, 1, 60_000),
    delay: clamp(instance.delay, 0, 60_000),
    direction: instance.direction ?? meta.defaults.direction ?? 'up',
    distance: clamp(
      instance.distance ?? meta.defaults.distance ?? 0,
      0,
      ANIM_CAPS.distance,
    ),
    easing: instance.easing ?? meta.defaults.easing,
    stagger: clamp(instance.stagger ?? 0, 0, ANIM_CAPS.stagger),
  };
}
