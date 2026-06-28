import { z } from 'zod';

/** The project document is the single contract shared by the editor, Dexie
 * persistence, `.calqo` import/export, and AI template/translation output. It is
 * versioned so future shapes can migrate forward. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

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
  z.object({ type: z.literal('linear'), angle: z.number().default(0), stops: z.array(gradientStopSchema).min(2) }),
  z.object({ type: z.literal('radial'), stops: z.array(gradientStopSchema).min(2) }),
  z.object({ type: z.literal('image'), assetId: z.string(), fit: z.enum(['cover', 'contain', 'stretch']).default('cover') }),
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
  fill: fillSchema,
  stroke: strokeSchema.optional(),
  cornerRadius: z.number().nonnegative().optional(),
  points: z.array(z.number()).optional(),
  /** Smoothing for freehand strokes (Konva line tension). */
  tension: z.number().optional(),
  /** Head configuration for arrow shapes. */
  arrow: arrowStyleSchema.optional(),
});

/** Non-destructive image mask: the renderer clips the image to this shape.
 * `radius` only applies to the rounded-rectangle mask. */
export const imageMaskSchema = z.object({
  shape: z.enum(['rounded', 'circle', 'ellipse', 'triangle', 'star', 'hexagon']),
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
  crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  /** Where a `cover` crop is anchored, 0–1 on each axis (0.5 = centre). */
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
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
  kind: z.enum(['bullet', 'dash', 'arrow', 'none', 'character', 'asset']).default('bullet'),
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

export const artboardSchema = z.object({
  id: z.string(),
  name: z.string(),
  preset: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  background: backgroundFillSchema,
  layers: z.array(layerSchema).default([]),
  guides: z.array(guideSchema).optional(),
  grid: gridSettingsSchema.optional(),
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
  mode: z.enum(['do-not-translate', 'preferred-translation']).default('do-not-translate'),
  notes: z.string().optional(),
});

export const projectSchema = z.object({
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
  metadata: projectMetadataSchema.optional(),
});

export type CalqoProject = z.infer<typeof projectSchema>;
export type CalqoArtboard = z.infer<typeof artboardSchema>;
export type CalqoAssetRef = z.infer<typeof assetRefSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type ImageMask = z.infer<typeof imageMaskSchema>;
export type ImageFrame = z.infer<typeof imageFrameSchema>;
export type ImageBackgroundRemoval = z.infer<typeof imageBackgroundRemovalSchema>;
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
