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

/** Stroke supports either an explicit dash array or a named style (`dashed` /
 * `dotted`) the renderer expands from the width, plus an optional line cap. */
const strokeSchema = z.object({
  color: hexish,
  width: z.number().nonnegative(),
  dash: z.array(z.number()).optional(),
  style: z.enum(['solid', 'dashed', 'dotted']).optional(),
  cap: z.enum(['butt', 'round', 'square']).optional(),
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

const layerEffectsSchema = z.object({
  shadow: shadowSchema.optional(),
  blur: z.number().nonnegative().optional(),
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
};

const textStyleSchema = z.object({
  fontFamily: z.string().default('Inter'),
  fontSize: z.number().positive().default(48),
  fontWeight: z.union([z.number(), z.string()]).default(400),
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

export const imageLayerSchema = z.object({
  ...baseLayerShape,
  type: z.literal('image'),
  assetId: z.string(),
  fit: z.enum(['cover', 'contain', 'stretch']).default('cover'),
  crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  filters: z
    .object({
      blur: z.number().optional(),
      brightness: z.number().optional(),
      contrast: z.number().optional(),
      saturation: z.number().optional(),
    })
    .optional(),
});

export const svgLayerSchema = z.object({
  ...baseLayerShape,
  type: z.literal('svg'),
  assetId: z.string(),
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
  expanded?: boolean;
  children: CalqoLayer[];
}

export type CalqoLayer =
  | z.infer<typeof textLayerSchema>
  | z.infer<typeof shapeLayerSchema>
  | z.infer<typeof imageLayerSchema>
  | z.infer<typeof svgLayerSchema>
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
export type SvgLayer = z.infer<typeof svgLayerSchema>;
export type BackgroundFill = z.infer<typeof backgroundFillSchema>;
export type Fill = z.infer<typeof fillSchema>;
export type StrokeStyle = z.infer<typeof strokeSchema>;
export type ArrowStyle = z.infer<typeof arrowStyleSchema>;
export type LocaleCode = z.infer<typeof localeCodeSchema>;
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export type TextOverflowState = z.infer<typeof textOverflowSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type ShadowStyle = z.infer<typeof shadowSchema>;
