import { z } from 'zod';

/** The project document is the single contract shared by the editor, Dexie
 * persistence, `.calqo` import/export, and AI template/translation output. It is
 * versioned so future shapes can migrate forward. */
export const CURRENT_SCHEMA_VERSION = 2 as const;

/** A BCP-47-ish content locale code, e.g. "fr", "tr", "en". */
export const localeCodeSchema = z.string().min(2).max(10);

const hexish = z.string(); // colors are kept as freeform CSS color strings

const shadowSchema = z.object({
  color: hexish,
  blur: z.number().nonnegative(),
  offsetX: z.number(),
  offsetY: z.number(),
  opacity: z.number().min(0).max(1).default(1),
});

/** Named stroke "looks" the renderer expands into one or more passes. `plain` /
 * `dashed` / `dotted` are single-node; `double` / `offset` / `outline` /
 * `marker` add sibling passes; `neon` / `glow` add a coloured shadow. The
 * roughened looks (`hand-drawn` / `rough` / `scribble` / `sketch` / `inner`)
 * are single-node approximations via dash arrays, caps/joins, and an offset
 * stroke-shadow — raster is faithful, SVG is approximated. */
export const strokeLookSchema = z.enum([
  'plain',
  'dashed',
  'dotted',
  'neon',
  'glow',
  'double',
  'offset',
  'outline',
  'marker',
  'hand-drawn',
  'rough',
  'scribble',
  'sketch',
  'inner',
]);

/** Stroke supports either an explicit dash array or a named style (`dashed` /
 * `dotted`) the renderer expands from the width, plus an optional line cap, a
 * line join, custom dash/gap lengths, and an expressive `look` (Phase R). */
export const strokeSchema = z.object({
  color: hexish,
  width: z.number().nonnegative(),
  dash: z.array(z.number()).optional(),
  style: z.enum(['solid', 'dashed', 'dotted']).optional(),
  cap: z.enum(['butt', 'round', 'square']).optional(),
  /** Corner treatment where the renderer/export supports it. */
  join: z.enum(['miter', 'round', 'bevel']).optional(),
  /** Custom dashed-line tuning: explicit dash length and gap, in px. */
  dashLen: z.number().nonnegative().optional(),
  gap: z.number().nonnegative().optional(),
  /** Expressive stroke look applied on top of colour/width. */
  look: strokeLookSchema.optional(),
  /** Accent colour for `double` / `offset` / `outline` / glow looks. */
  altColor: hexish.optional(),
  /** Strength 0–1 for `neon` / `glow` looks. */
  intensity: z.number().min(0).max(1).optional(),
});

const gradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: hexish,
});

/** A repeating pattern fill (dots / hatch / grid …) rendered from a generated
 * tile so shapes can carry texture, not just flat colour. */
const patternFillSchema = z.object({
  type: z.literal('pattern'),
  pattern: z.enum(['dots', 'grid', 'hatch', 'cross-hatch', 'checker']),
  color: hexish,
  background: hexish.default('#FFFFFF'),
  scale: z.number().positive().default(1),
  angle: z.number().default(0),
});

export const fillSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: hexish }),
  z.object({
    type: z.literal('linear'),
    angle: z.number().default(0),
    stops: z.array(gradientStopSchema).min(2),
  }),
  z.object({
    type: z.literal('radial'),
    stops: z.array(gradientStopSchema).min(2),
  }),
  patternFillSchema,
  z.object({
    type: z.literal('image'),
    assetId: z.string(),
    fit: z.enum(['cover', 'contain', 'stretch']).default('cover'),
  }),
]);

export const backgroundFillSchema = z.union([
  z.object({ type: z.literal('solid'), color: hexish }),
  z.object({
    type: z.literal('linear'),
    angle: z.number().default(0),
    stops: z.array(gradientStopSchema).min(2),
  }),
  z.object({
    type: z.literal('radial'),
    stops: z.array(gradientStopSchema).min(2),
  }),
  z.object({
    type: z.literal('image'),
    assetId: z.string(),
    fit: z.enum(['cover', 'contain', 'stretch']).default('cover'),
  }),
]);

export const layerEffectsSchema = z.object({
  shadow: shadowSchema.optional(),
  blur: z.number().nonnegative().optional(),
});

/** Non-destructive "sticker" outline: a coloured halo drawn behind the layer
 * (white-sticker / thumbnail-text treatment). Works on any layer type. */
export const stickerOutlineSchema = z.object({
  color: hexish.default('#FFFFFF'),
  width: z.number().nonnegative().default(12),
  shadow: shadowSchema.optional(),
});

// ---------------------------------------------------------------------------
// Animation (schema v2, "Animate" mode — docs/calqo-animation-extension-plan.md)
//
// All animation fields are OPTIONAL: a static project stays a valid static
// project. Presets are the persisted document; compiled keyframe tracks are a
// runtime-only derivative (never persisted). Custom tracks persist because
// there is nothing to compile them from. Numbers are `.finite()` with
// property-specific ranges — no open numeric fields, matching the rest of the
// schema's discipline.
// ---------------------------------------------------------------------------

/** Normative timing bounds. A scene (artboard) holds between 250 ms and 60 s. */
export const MIN_SCENE_DURATION_MS = 250 as const;
export const MAX_SCENE_DURATION_MS = 60_000 as const;
/** Scene duration assumed for validation when an animated artboard omits an
 * explicit `timing` block. Kept small so stray long windows are still caught. */
export const DEFAULT_SCENE_DURATION_MS = 5_000 as const;

/** Per-property numeric caps (decision §18.2). Reused by the preset catalog so
 * generated tracks stay inside the validated ranges. */
export const ANIM_CAPS = {
  /** Additive pixel offset (dx/dy) magnitude. */
  offset: 10_000,
  /** Slide/rise travel distance in px. */
  distance: 4_000,
  /** Multiplicative scale factor (must stay > 0). */
  scale: 10,
  /** Additive rotation in degrees. */
  rotation: 3_600,
  /** Blur radius in px. */
  blur: 200,
  /** Per-child stagger in ms. */
  stagger: 10_000,
} as const;

/** Animatable wrapper properties. Transform props compose over document
 * geometry (§4.2); `wipe-progress`/`blur` are dedicated reveal props. */
export const animPropSchema = z.enum([
  'dx',
  'dy',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'wipe-progress',
  'blur',
]);
export type AnimProp = z.infer<typeof animPropSchema>;

export const easingSchema = z.enum([
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'overshoot',
  'bounce',
]);
export type Easing = z.infer<typeof easingSchema>;

/** Inclusive `[min, max]` value range accepted for each animatable property.
 * `scaleX/scaleY` exclude 0 (a collapsed layer is a bug, not a keyframe). */
const ANIM_PROP_RANGE: Record<AnimProp, { min: number; max: number }> = {
  dx: { min: -ANIM_CAPS.offset, max: ANIM_CAPS.offset },
  dy: { min: -ANIM_CAPS.offset, max: ANIM_CAPS.offset },
  scaleX: { min: 0, max: ANIM_CAPS.scale },
  scaleY: { min: 0, max: ANIM_CAPS.scale },
  rotation: { min: -ANIM_CAPS.rotation, max: ANIM_CAPS.rotation },
  opacity: { min: 0, max: 1 },
  'wipe-progress': { min: 0, max: 1 },
  blur: { min: 0, max: ANIM_CAPS.blur },
};

export function animPropRange(prop: AnimProp): { min: number; max: number } {
  return ANIM_PROP_RANGE[prop];
}

export const keyframeSchema = z.object({
  /** 0–1, normalized to the owning window. */
  t: z.number().finite().min(0).max(1),
  /** Finite; range validated per-prop at the track level. */
  value: z.number().finite(),
  /** Easing *into* this keyframe. */
  easing: easingSchema.optional(),
});
export type Keyframe = z.infer<typeof keyframeSchema>;

/** One property track: ≥2 keyframes, strictly-increasing unique `t`, each value
 * within the property's range. */
export const trackSchema = z
  .object({
    prop: animPropSchema,
    keyframes: z.array(keyframeSchema).min(2),
  })
  .superRefine((track, ctx) => {
    const { min, max } = ANIM_PROP_RANGE[track.prop];
    const scaleProp = track.prop === 'scaleX' || track.prop === 'scaleY';
    for (let i = 0; i < track.keyframes.length; i++) {
      const kf = track.keyframes[i];
      if (i > 0 && kf.t <= track.keyframes[i - 1].t) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `keyframe times must strictly increase (index ${i})`,
          path: ['keyframes', i, 't'],
        });
      }
      const belowMin = scaleProp ? kf.value <= min : kf.value < min;
      if (belowMin || kf.value > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `value ${kf.value} out of range for ${track.prop} (${scaleProp ? '(' : '['}${min}, ${max}])`,
          path: ['keyframes', i, 'value'],
        });
      }
    }
  });
export type Track = z.infer<typeof trackSchema>;

/** A custom animation window placed on the scene timeline. Tracks within a
 * window carry unique props (no two tracks drive the same property). */
export const trackWindowSchema = z
  .object({
    /** ms from scene start. */
    start: z.number().finite().min(0).max(MAX_SCENE_DURATION_MS),
    /** ms, > 0; the window must fit inside the scene (checked at artboard level). */
    duration: z.number().finite().positive().max(MAX_SCENE_DURATION_MS),
    tracks: z.array(trackSchema).min(1),
  })
  .superRefine((window, ctx) => {
    const seen = new Set<AnimProp>();
    for (let i = 0; i < window.tracks.length; i++) {
      const prop = window.tracks[i].prop;
      if (seen.has(prop)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate prop "${prop}" in one window`,
          path: ['tracks', i, 'prop'],
        });
      }
      seen.add(prop);
    }
  });
export type TrackWindow = z.infer<typeof trackWindowSchema>;

/** Preset kinds. Enter/exit and emphasis kinds ship in v1; the text-reveal
 * kinds (`typewriter`, `word-rise`) are reserved but rejected until AN-3. */
export const presetKindSchema = z.enum([
  // enter / exit
  'fade',
  'slide',
  'pop',
  'rise',
  'wipe',
  'blur-in',
  // emphasis
  'pulse',
  'wiggle',
  'float',
  // text (reserved, not yet enabled)
  'typewriter',
  'word-rise',
]);
export type PresetKind = z.infer<typeof presetKindSchema>;

/** Preset kinds valid in the enter/exit slots. */
export const ENTER_EXIT_PRESET_KINDS = [
  'fade',
  'slide',
  'pop',
  'rise',
  'wipe',
  'blur-in',
] as const satisfies readonly PresetKind[];
/** Preset kinds valid in the emphasis slot. */
export const EMPHASIS_PRESET_KINDS = [
  'pulse',
  'wiggle',
  'float',
] as const satisfies readonly PresetKind[];
/** Preset kinds that read a `direction`. */
export const DIRECTIONAL_PRESET_KINDS = [
  'slide',
  'wipe',
  'rise',
] as const satisfies readonly PresetKind[];
/** Text-reveal preset kinds (enter slot, text/list layers only) — AN-3.5. */
export const TEXT_PRESET_KINDS = [
  'typewriter',
  'word-rise',
] as const satisfies readonly PresetKind[];
/** Preset kinds valid in the enter slot: the enter/exit kinds plus text reveals
 * (whose layer-kind restriction is enforced by the compiler/command layer). */
export const ENTER_PRESET_KINDS = [
  ...ENTER_EXIT_PRESET_KINDS,
  ...TEXT_PRESET_KINDS,
] as const satisfies readonly PresetKind[];
/** No preset kind is deferred now that text reveals ship (AN-3.5); kept for
 * backward compatibility with earlier imports. */
export const DEFERRED_PRESET_KINDS = [] as const satisfies readonly PresetKind[];

export const presetInstanceSchema = z.object({
  kind: presetKindSchema,
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  /** px, slide/rise travel. */
  distance: z.number().finite().positive().max(ANIM_CAPS.distance).optional(),
  /** ms, > 0. */
  duration: z.number().finite().positive().max(MAX_SCENE_DURATION_MS),
  /** ms from the slot anchor. */
  delay: z.number().finite().min(0).max(MAX_SCENE_DURATION_MS),
  easing: easingSchema.optional(),
  /** ms per child; group/list slots only. */
  stagger: z.number().finite().min(0).max(ANIM_CAPS.stagger).optional(),
});
export type PresetInstance = z.infer<typeof presetInstanceSchema>;

function refinePresetSlot(
  instance: PresetInstance,
  allowed: readonly PresetKind[],
  slot: string,
  ctx: z.RefinementCtx,
): void {
  if ((DEFERRED_PRESET_KINDS as readonly PresetKind[]).includes(instance.kind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `preset "${instance.kind}" is not enabled yet`,
      path: [slot, 'kind'],
    });
    return;
  }
  if (!allowed.includes(instance.kind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `preset "${instance.kind}" is not valid in the ${slot} slot`,
      path: [slot, 'kind'],
    });
  }
  if (
    instance.direction !== undefined &&
    !(DIRECTIONAL_PRESET_KINDS as readonly PresetKind[]).includes(instance.kind)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `preset "${instance.kind}" does not take a direction`,
      path: [slot, 'direction'],
    });
  }
}

/** Per-layer animation: preset-authored (enter/emphasis/exit) or custom raw
 * tracks — a `mode`-tagged union so a layer is one or the other, never both.
 * `z.union` (not `discriminatedUnion`) because each arm carries a `superRefine`;
 * the `mode` literal still narrows the inferred TypeScript type. */
export const layerAnimationSchema = z.union([
  z
    .object({
      mode: z.literal('preset'),
      enter: presetInstanceSchema.optional(),
      emphasis: presetInstanceSchema.optional(),
      exit: presetInstanceSchema.optional(),
    })
    .superRefine((anim, ctx) => {
      if (anim.enter)
        refinePresetSlot(anim.enter, ENTER_PRESET_KINDS, 'enter', ctx);
      if (anim.emphasis)
        refinePresetSlot(
          anim.emphasis,
          EMPHASIS_PRESET_KINDS,
          'emphasis',
          ctx,
        );
      if (anim.exit)
        refinePresetSlot(anim.exit, ENTER_EXIT_PRESET_KINDS, 'exit', ctx);
    }),
  z
    .object({
      mode: z.literal('custom'),
      windows: z.array(trackWindowSchema).min(1),
    })
    .superRefine((anim, ctx) => {
      // Per-prop overlap across windows is forbidden by construction.
      const spans = new Map<AnimProp, Array<{ start: number; end: number }>>();
      anim.windows.forEach((window, wi) => {
        const end = window.start + window.duration;
        for (const track of window.tracks) {
          const list = spans.get(track.prop) ?? [];
          for (const prev of list) {
            if (window.start < prev.end && prev.start < end) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `windows overlap for prop "${track.prop}"`,
                path: ['windows', wi],
              });
            }
          }
          list.push({ start: window.start, end });
          spans.set(track.prop, list);
        }
      });
    }),
]);
export type LayerAnimation = z.infer<typeof layerAnimationSchema>;

/** Per-artboard scene timing. */
export const sceneTimingSchema = z.object({
  duration: z
    .number()
    .finite()
    .min(MIN_SCENE_DURATION_MS)
    .max(MAX_SCENE_DURATION_MS),
});
export type SceneTiming = z.infer<typeof sceneTimingSchema>;

/** A clip is at most 60 s including transitions (AN-4.2). */
export const MAX_CLIP_DURATION_MS = 60_000 as const;
/** Scene transition kinds and their timing bounds (AN-4.2). `cut` is instant. */
export const SCENE_TRANSITION_KINDS = ['cut', 'fade', 'slide'] as const;
export type SceneTransitionKind = (typeof SCENE_TRANSITION_KINDS)[number];
export const DEFAULT_TRANSITION_MS = 500 as const;
export const MAX_TRANSITION_MS = 2_000 as const;

/** One ordered entry in a multi-scene clip: an artboard plus the transition that
 * plays *into* it from the previous scene (ignored on the first scene). */
export const sceneEntrySchema = z.object({
  artboardId: z.string(),
  transition: z.enum(SCENE_TRANSITION_KINDS).optional(),
  /** Transition duration in ms; defaults to {@link DEFAULT_TRANSITION_MS} for
   * fade/slide and is forced to 0 for `cut`. */
  transitionDurationMs: z
    .number()
    .finite()
    .min(0)
    .max(MAX_TRANSITION_MS)
    .optional(),
});
export type SceneEntry = z.infer<typeof sceneEntrySchema>;

/** Clip-level settings. `scenes` drives the multi-artboard sequence exporter
 * (AN-4.2); a single-artboard clip leaves it empty and exports the active
 * artboard. */
export const clipSettingsSchema = z.object({
  fps: z
    .union([z.literal(24), z.literal(30), z.literal(60)])
    .default(30),
  scenes: z.array(sceneEntrySchema).optional(),
});
export type ClipSettings = z.infer<typeof clipSettingsSchema>;

const baseLayerShape = {
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay']).optional(),
  effects: layerEffectsSchema.optional(),
  /** Optional sticker outline halo (Phase R). */
  sticker: stickerOutlineSchema.optional(),
  /** Optional per-layer animation (schema v2, Animate mode). Absent on a static
   * layer; presets or custom tracks otherwise. */
  animation: layerAnimationSchema.optional(),
};

export const textStyleSchema = z.object({
  fontFamily: z.string().default('Inter'),
  fontSize: z.number().positive().default(48),
  fontWeight: z.union([z.number(), z.string()]).default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  textDecoration: z.enum(['none', 'underline']).default('none'),
  color: hexish.default('#000000'),
  align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  lineHeight: z.number().positive().default(1.2),
  letterSpacing: z.number().default(0),
  stroke: strokeSchema.optional(),
  shadow: shadowSchema.optional(),
});

const textOverflowSchema = z.object({
  hasOverflow: z.boolean(),
  measuredAtLocale: localeCodeSchema,
  suggestedAction: z.enum(['increase-box', 'reduce-font', 'manual-check']),
});

export const textLayerSchema = z.object({
  ...baseLayerShape,
  type: z.literal('text'),
  /** One string per content locale. */
  text: z.record(localeCodeSchema, z.string()),
  style: textStyleSchema,
  autoFit: z.boolean().optional(),
  overflow: textOverflowSchema.optional(),
});

/** Arrow head configuration for `shape: 'arrow'` layers. */
const arrowStyleSchema = z.object({
  start: z.boolean().default(false),
  end: z.boolean().default(true),
  pointerLength: z.number().positive().default(16),
  pointerWidth: z.number().positive().default(16),
  headStyle: z.enum(['triangle', 'chevron', 'bar', 'dot']).optional(),
});

export const shapeLayerSchema = z.object({
  ...baseLayerShape,
  type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line', 'polygon', 'arrow', 'freehand']),
  // Open paths (line / arrow / freehand) are stroke-first. Supplying a dummy
  // fill is needless MCP friction, so normalize an omitted fill to transparent
  // while keeping the stored ShapeLayer contract uniform for render/export.
  fill: fillSchema.default({ type: 'solid', color: 'transparent' }),
  stroke: strokeSchema.optional(),
  cornerRadius: z.number().nonnegative().optional(),
  points: z.array(z.number()).optional(),
  /** Per-point stroke widths in px for pressure-sensitive freehand strokes
   * (Apple Pencil / stylus force): one width per x/y pair in `points`. When
   * present the renderer fills a variable-width ribbon instead of stroking a
   * constant-width line. */
  pointWidths: z.array(z.number().nonnegative()).optional(),
  /** Smoothing for freehand strokes (Konva line tension). */
  tension: z.number().optional(),
  /** Head configuration for arrow shapes. */
  arrow: arrowStyleSchema.optional(),
});

/** Non-destructive image mask: the renderer clips the image to this shape.
 * `radius` only applies to the rounded-rectangle mask. */
export const imageMaskSchema = z.object({
  shape: z.enum([
    'rounded',
    'circle',
    'ellipse',
    'triangle',
    'star',
    'hexagon',
  ]),
  radius: z.number().nonnegative().optional(),
});

/** Non-destructive decorative frame drawn around an image. The image content is
 * inset so the frame sits around the photo, not over it. Crop/focal/mask/filter
 * state is preserved when a frame is applied, changed, or removed (Phase R). */
export const imageFrameSchema = z.object({
  kind: z.enum([
    'inset',
    'centered',
    'outside',
    'rounded',
    'circle',
    'double-line',
    'polaroid',
    'torn-paper',
    'tape-corners',
    'photo-booth-strip',
    'scalloped-edges',
    'postage-stamp',
    'soft-mat',
    'thick-poster-border',
    'shadowed-cutout',
  ]),
  color: hexish.default('#FFFFFF'),
  width: z.number().nonnegative().default(16),
  /** Corner radius for `rounded` frames. */
  radius: z.number().nonnegative().optional(),
  /** Inner gap between frame and photo (mat / polaroid). */
  padding: z.number().nonnegative().optional(),
  shadow: shadowSchema.optional(),
  /** Polaroid caption strip text, per content locale. */
  caption: z.record(localeCodeSchema, z.string()).optional(),
});

export const imageBackgroundRemovalPassSchema = z.object({
  id: z.string(),
  color: hexish,
  tolerance: z.number().min(0).max(100),
  softness: z.number().min(0).max(100),
  mode: z.enum(['connected', 'global']),
});

export const imageBackgroundRemovalSchema = z.object({
  /** Original raster asset. Nested `assetId` keeps asset remapping generic. */
  source: z.object({ assetId: z.string() }),
  /** Latest generated transparent PNG derivative. */
  result: z.object({ assetId: z.string() }).optional(),
  passes: z.array(imageBackgroundRemovalPassSchema).default([]),
});

export const imageLayerSchema = z.object({
  ...baseLayerShape,
  type: z.literal('image'),
  assetId: z.string(),
  fit: z.enum(['cover', 'contain', 'stretch']).default('cover'),
  crop: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional(),
  /** Where a `cover` crop is anchored, 0–1 on each axis (0.5 = centre). */
  focalPoint: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
  mask: imageMaskSchema.optional(),
  filters: z
    .object({
      blur: z.number().optional(),
      brightness: z.number().optional(),
      contrast: z.number().optional(),
      saturation: z.number().optional(),
    })
    .optional(),
  /** Non-destructive decorative frame (Phase R). */
  frame: imageFrameSchema.optional(),
  /** Non-destructive raster background removal via additive colour passes. */
  backgroundRemoval: imageBackgroundRemovalSchema.optional(),
});

export const svgLayerSchema = z.object({
  ...baseLayerShape,
  type: z.literal('svg'),
  assetId: z.string(),
  /** Optional tint re-applied to the asset's fills/strokes at render time so
   * the original SVG stays editable (non-destructive recolour). */
  color: hexish.optional(),
});

/** The glyph drawn in front of each list row. `bullet` / `dash` / `arrow` are
 * built-in; `none` draws nothing; `character` renders any typed glyph (emoji,
 * checkmark, custom symbol); `asset` references an imported raster/SVG so the
 * marker can be a real icon from the library. */
export const listMarkerSchema = z.object({
  kind: z
    .enum(['bullet', 'dash', 'arrow', 'none', 'character', 'asset'])
    .default('bullet'),
  /** Used only when `kind === 'character'` (any single character or short glyph). */
  character: z.string().optional(),
  /** Used only when `kind === 'asset'`; must match a `CalqoAssetRef.id`. */
  assetId: z.string().optional(),
  /** Marker colour (glyph or asset tint). */
  color: hexish.default('#111827'),
  /** Marker size in px; defaults to the row's font size when omitted. */
  size: z.number().positive().optional(),
});

/** One row of a list. Carries its own per-locale text and overflow flag so each
 * row participates in the multilingual + translation pipeline independently. */
export const listItemSchema = z.object({
  id: z.string(),
  text: z.record(localeCodeSchema, z.string()),
  overflow: textOverflowSchema.optional(),
});

export const listLayerSchema = z.object({
  ...baseLayerShape,
  type: z.literal('list'),
  items: z.array(listItemSchema).min(1),
  marker: listMarkerSchema,
  /** Horizontal gap between the marker and the row text, in px. */
  markerGap: z.number().default(8),
  /** Shared typography for all rows (same shape as text-layer style, so presets
   * and per-locale variants work identically). */
  style: textStyleSchema,
  autoFit: z.boolean().optional(),
  overflow: textOverflowSchema.optional(),
});

/** Layers form a discriminated union; groups nest recursively. Typed explicitly
 * because z.lazy() erases the inferred type. */
export interface GroupLayer {
  id: string;
  name: string;
  type: 'group';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
  effects?: z.infer<typeof layerEffectsSchema>;
  sticker?: z.infer<typeof stickerOutlineSchema>;
  /** Optional per-layer animation (schema v2). Groups animate as one unit. */
  animation?: LayerAnimation;
  expanded?: boolean;
  children: CalqoLayer[];
}

export type CalqoLayer =
  | z.infer<typeof textLayerSchema>
  | z.infer<typeof shapeLayerSchema>
  | z.infer<typeof imageLayerSchema>
  | z.infer<typeof svgLayerSchema>
  | z.infer<typeof listLayerSchema>
  | GroupLayer;

export const groupLayerSchema: z.ZodType<GroupLayer> = z.lazy(() =>
  z.object({
    ...baseLayerShape,
    type: z.literal('group'),
    expanded: z.boolean().optional(),
    children: z.array(layerSchema),
  }),
) as unknown as z.ZodType<GroupLayer>;

// z.union (rather than discriminatedUnion) so the lazy group reference composes;
// the leaf schemas still carry a literal `type` discriminator for narrowing.
export const layerSchema: z.ZodType<CalqoLayer> = z.lazy(() =>
  z.union([
    textLayerSchema,
    shapeLayerSchema,
    imageLayerSchema,
    svgLayerSchema,
    listLayerSchema,
    groupLayerSchema,
  ]),
) as unknown as z.ZodType<CalqoLayer>;

const gridSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  size: z.number().positive().default(8),
});

const guideSchema = z.object({
  id: z.string(),
  axis: z.enum(['x', 'y']),
  position: z.number(),
});

/** Walk a layer tree and report any animation window/slot that would end after
 * the scene. Preset windows are `delay + duration`; custom windows are
 * `start + duration`. This is the import-time counterpart to the command-layer
 * rejection described in §4.4 — AI-generated animation JSON is caught here. */
function collectOutOfSceneAnimations(
  layers: CalqoLayer[],
  sceneDuration: number,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ['layers'],
): void {
  layers.forEach((layer, i) => {
    const base: (string | number)[] = [...path, i, 'animation'];
    const anim = layer.animation;
    if (anim) {
      if (anim.mode === 'preset') {
        for (const slot of ['enter', 'emphasis', 'exit'] as const) {
          const inst = anim[slot];
          if (inst && inst.delay + inst.duration > sceneDuration) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${slot} preset ends at ${inst.delay + inst.duration}ms, after the ${sceneDuration}ms scene`,
              path: [...base, slot],
            });
          }
        }
      } else {
        anim.windows.forEach((w, wi) => {
          if (w.start + w.duration > sceneDuration) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `window ends at ${w.start + w.duration}ms, after the ${sceneDuration}ms scene`,
              path: [...base, 'windows', wi],
            });
          }
        });
      }
    }
    if (layer.type === 'group') {
      collectOutOfSceneAnimations(layer.children, sceneDuration, ctx, [
        ...path,
        i,
        'children',
      ]);
    }
  });
}

export const artboardSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    preset: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    background: backgroundFillSchema,
    layers: z.array(layerSchema).default([]),
    guides: z.array(guideSchema).optional(),
    grid: gridSettingsSchema.optional(),
    /** Optional scene timing (schema v2). Absent on a static artboard. */
    timing: sceneTimingSchema.optional(),
  })
  .superRefine((artboard, ctx) => {
    const sceneDuration = artboard.timing?.duration ?? DEFAULT_SCENE_DURATION_MS;
    collectOutOfSceneAnimations(artboard.layers, sceneDuration, ctx);
  });

export const assetRefSchema = z.object({
  id: z.string(),
  kind: z.enum(['raster', 'svg']),
  name: z.string(),
  mimeType: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  storageKey: z.string(),
  createdAt: z.string(),
});

export const projectMetadataSchema = z
  .object({
    description: z.string().optional(),
  })
  .passthrough();

/** A glossary entry constrains translation: terms to leave untouched, or a
 * preferred rendering in target locales (plan §13.5). */
export const glossaryEntrySchema = z.object({
  source: z.string().min(1),
  target: z.string().optional(),
  mode: z
    .enum(['do-not-translate', 'preferred-translation'])
    .default('do-not-translate'),
  notes: z.string().optional(),
});

/** Resolved transition duration (ms): `cut` is instant; fade/slide default to
 * {@link DEFAULT_TRANSITION_MS}. Shared by validation and the runtime sequence. */
export function sceneTransitionDurationMs(entry: SceneEntry): number {
  const kind = entry.transition ?? 'cut';
  if (kind === 'cut') return 0;
  return Math.min(entry.transitionDurationMs ?? DEFAULT_TRANSITION_MS, MAX_TRANSITION_MS);
}

export const projectSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    contentLocales: z.array(localeCodeSchema).min(1),
    activeContentLocale: localeCodeSchema,
    palette: z.array(hexish).default([]),
    artboards: z.array(artboardSchema).min(1),
    assets: z.array(assetRefSchema).default([]),
    /** Project-wide translation glossary / do-not-translate list (plan §13.5). */
    glossary: z.array(glossaryEntrySchema).default([]),
    /** Optional clip-level animation settings (schema v2). Absent on a static
     * project; `fps` defaults to 30 once present. */
    clipSettings: clipSettingsSchema.optional(),
    metadata: projectMetadataSchema.optional(),
  })
  .superRefine((project, ctx) => {
    // Multi-scene clip validation (AN-4.2): scenes must reference existing,
    // unique artboards of matching dimensions, and the whole clip (scene
    // durations + transitions) must fit inside the 60 s limit.
    const scenes = project.clipSettings?.scenes;
    if (!scenes || scenes.length === 0) return;
    const byId = new Map(project.artboards.map((a) => [a.id, a]));
    const seen = new Set<string>();
    let total = 0;
    let firstDims: { w: number; h: number } | undefined;
    scenes.forEach((entry, i) => {
      const artboard = byId.get(entry.artboardId);
      if (!artboard) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `scene ${i} references unknown artboard "${entry.artboardId}"`,
          path: ['clipSettings', 'scenes', i, 'artboardId'],
        });
        return;
      }
      if (seen.has(entry.artboardId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `artboard "${entry.artboardId}" appears in more than one scene`,
          path: ['clipSettings', 'scenes', i, 'artboardId'],
        });
      }
      seen.add(entry.artboardId);
      if (!firstDims) {
        firstDims = { w: artboard.width, h: artboard.height };
      } else if (artboard.width !== firstDims.w || artboard.height !== firstDims.h) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `scene ${i} artboard size ${artboard.width}×${artboard.height} does not match the clip size ${firstDims.w}×${firstDims.h}`,
          path: ['clipSettings', 'scenes', i, 'artboardId'],
        });
      }
      total += artboard.timing?.duration ?? DEFAULT_SCENE_DURATION_MS;
      if (i > 0) total += sceneTransitionDurationMs(entry);
    });
    if (total > MAX_CLIP_DURATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `clip is ${total}ms, over the ${MAX_CLIP_DURATION_MS}ms limit`,
        path: ['clipSettings', 'scenes'],
      });
    }
  });

export type CalqoProject = z.infer<typeof projectSchema>;
export type CalqoArtboard = z.infer<typeof artboardSchema>;
export type CalqoAssetRef = z.infer<typeof assetRefSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type ImageMask = z.infer<typeof imageMaskSchema>;
export type ImageFrame = z.infer<typeof imageFrameSchema>;
export type ImageBackgroundRemoval = z.infer<
  typeof imageBackgroundRemovalSchema
>;
export type ImageBackgroundRemovalPass = z.infer<
  typeof imageBackgroundRemovalPassSchema
>;
export type ImageFilters = NonNullable<ImageLayer['filters']>;
export type SvgLayer = z.infer<typeof svgLayerSchema>;
export type ListLayer = z.infer<typeof listLayerSchema>;
export type ListItem = z.infer<typeof listItemSchema>;
export type ListMarker = z.infer<typeof listMarkerSchema>;
export type BackgroundFill = z.infer<typeof backgroundFillSchema>;
export type Fill = z.infer<typeof fillSchema>;
export type StrokeStyle = z.infer<typeof strokeSchema>;
export type StrokeLook = z.infer<typeof strokeLookSchema>;
export type StickerOutline = z.infer<typeof stickerOutlineSchema>;
export type LayerEffects = z.infer<typeof layerEffectsSchema>;
export type ArrowStyle = z.infer<typeof arrowStyleSchema>;
export type LocaleCode = z.infer<typeof localeCodeSchema>;
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export type TextOverflowState = z.infer<typeof textOverflowSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type ShadowStyle = z.infer<typeof shadowSchema>;
