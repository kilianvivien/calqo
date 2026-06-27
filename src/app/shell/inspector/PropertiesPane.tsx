import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Badge,
  Columns3,
  Rows3,
  Brush,
  Circle,
  Diamond,
  Eye,
  EyeOff,
  Folder,
  Hand,
  Image as ImageIcon,
  Layers,
  List,
  Lock,
  Minus,
  MousePointer2,
  Unlock,
  BoxSelect,
  MoveUpRight,
  PenTool,
  Pipette,
  Plus,
  Shapes,
  Square,
  Star,
  Trash2,
  Triangle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { assetStorage } from '@/lib/adapters';
import {
  BRUSH_STYLE_IDS,
  brushStyleLayerPatch,
  polygonPoints,
  type PolygonPreset,
  updateLayerInActiveArtboard,
  updateLayersInActiveArtboard,
  alignSelectedLayers,
  distributeSelectedLayers,
  stackSelectedLayers,
  beginHistoryCoalescing,
  endHistoryCoalescing,
  replaceLayerAsset,
  addListItem,
  removeListItem,
  reorderListItem,
  updateListItemTextForLocale,
  setListMarker,
  setArtboardBackground,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { GlassSegmentedControl } from '@/components/glass';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import {
  useUiStore,
  type BrushStyle,
  type EditorTool,
} from '@/lib/state/uiStore';
import type {
  ArrowStyle,
  BackgroundFill,
  CalqoLayer,
  CalqoAssetRef,
  Fill,
  ImageLayer,
  ImageMask,
  ListLayer,
  ListMarker,
  ShadowStyle,
  StickerOutline,
  StrokeStyle,
  TextLayer,
} from '@/lib/schema';
import {
  BACKGROUND_FILL_TYPE_OPTIONS,
  FILL_TYPE_OPTIONS,
  PATTERN_OPTIONS,
  backgroundFillForType,
  fillForType,
  type BackgroundFillType,
  type FillType,
} from '@/editor/canvas/fillHelpers';
import { saveImageAsset } from '@/lib/utils/imageAsset';
import {
  isStageSamplerAvailable,
  sampleColorFromStage,
} from '@/editor/canvas/stageSampler';
import { FILTER_RANGES, hasActiveFilters } from '@/editor/canvas/imageFilters';
import { MASK_SHAPES } from '@/editor/canvas/maskClip';
import {
  TEXT_PRESET_IDS,
  textPresetStyle,
  type TextPresetId,
} from '@/editor/typography/textPresets';
import { FRAME_PRESET_IDS, framePreset } from '@/editor/images/framePresets';
import { STROKE_LOOK_IDS, strokeLookStyle, type StrokeLookId } from '@/editor/canvas/strokePresets';
import { ColorPickerPopover } from './ColorPickerPopover';
import { TextVariants } from './ContentControls';
import { useFontOptions } from '@/lib/hooks/useFontOptions';
import { useFontVariants } from '@/lib/hooks/useFontVariants';
import { FontMenuField, TextStyleButtons } from '@/components/inspector';

const LAYER_TYPE_ICON: Record<CalqoLayer['type'], LucideIcon> = {
  text: Type,
  shape: Square,
  image: ImageIcon,
  svg: Shapes,
  list: List,
  group: Folder,
};

const TOOL_ICON: Record<EditorTool, LucideIcon> = {
  select: MousePointer2,
  marquee: BoxSelect,
  pan: Hand,
  text: Type,
  list: List,
  rect: Square,
  ellipse: Circle,
  line: Minus,
  arrow: MoveUpRight,
  triangle: Triangle,
  diamond: Diamond,
  badge: Badge,
  star: Star,
  pen: PenTool,
  brush: Brush,
  image: ImageIcon,
  svg: Shapes,
};

const DRAW_TOOLS: EditorTool[] = [
  'text',
  'list',
  'rect',
  'ellipse',
  'line',
  'arrow',
  'triangle',
  'diamond',
  'badge',
  'star',
  'pen',
  'brush',
  'image',
  'svg',
];
const SHAPE_TOOLS = new Set<EditorTool>([
  'rect',
  'ellipse',
  'line',
  'arrow',
  'triangle',
  'diamond',
  'badge',
  'star',
]);
type ShapeKind = 'rect' | 'ellipse' | 'line' | PolygonPreset;

const SHAPE_KIND_OPTIONS: { value: ShapeKind; labelKey: string }[] = [
  { value: 'rect', labelKey: 'tools.rect' },
  { value: 'ellipse', labelKey: 'tools.ellipse' },
  { value: 'line', labelKey: 'tools.line' },
  { value: 'triangle', labelKey: 'tools.triangle' },
  { value: 'diamond', labelKey: 'tools.diamond' },
  { value: 'badge', labelKey: 'tools.badge' },
  { value: 'star', labelKey: 'tools.star' },
];

const COLOR_SWATCHES = [
  '#007AFF',
  '#28C840',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#111827',
  '#FFFFFF',
  '#000000',
];

function polygonDisplayName(kind: PolygonPreset): string {
  return kind === 'badge'
    ? 'Badge'
    : kind.charAt(0).toUpperCase() + kind.slice(1);
}

type ShapeLayerT = Extract<CalqoLayer, { type: 'shape' }>;

/** The shape-kind shown in the convert dropdown, or null for shapes that should
 * not be reshaped through it (arrows, freehand strokes, custom polygons). */
function convertibleKind(layer: ShapeLayerT): ShapeKind | null {
  if (
    layer.shape === 'rect' ||
    layer.shape === 'ellipse' ||
    layer.shape === 'line'
  ) {
    return layer.shape;
  }
  if (layer.shape === 'polygon') {
    const normalized = layer.name.toLowerCase().split(' ')[0];
    if (
      normalized === 'triangle' ||
      normalized === 'diamond' ||
      normalized === 'badge' ||
      normalized === 'star'
    ) {
      return normalized;
    }
  }
  return null;
}

/** Shapes that paint an interior fill (everything except open strokes). */
function isFilledShape(layer: ShapeLayerT): boolean {
  return (
    layer.shape !== 'line' &&
    layer.shape !== 'arrow' &&
    layer.shape !== 'freehand'
  );
}

function brushStyleFromLayer(layer: ShapeLayerT): BrushStyle {
  if (layer.stroke?.look === 'glow') return 'glow-pen';
  if (layer.stroke?.style === 'dashed') return 'dashed';
  if (layer.blendMode === 'multiply' && layer.opacity >= 0.75) {
    return 'marker-underline';
  }
  if (layer.blendMode === 'multiply') return 'highlighter';
  if ((layer.tension ?? 0.4) === 0.25) return 'felt-tip';
  if ((layer.tension ?? 0.4) === 0.18) return 'marker';
  return 'smooth';
}

/** Full fill editor: type switch plus solid/gradient/pattern/image sub-controls.
 * `projectId` enables the image fill (it needs to persist a picked asset). */
function FillField({
  fill,
  onChange,
  projectId,
}: {
  fill: Fill;
  onChange: (fill: Fill) => void;
  projectId?: string;
}) {
  const { t } = useTranslation('editor');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [pendingImageImport, setPendingImageImport] = useState(false);
  const type: FillType = fill.type;
  const selectedType: FillType = pendingImageImport ? 'image' : type;
  const options = projectId
    ? FILL_TYPE_OPTIONS
    : FILL_TYPE_OPTIONS.filter((value) => value !== 'image');
  const pickImage = () => imageInputRef.current?.click();
  return (
    <div className="space-y-1">
      <SelectField
        label={t('properties.fill')}
        value={selectedType}
        options={options.map((value) => ({
          value,
          label: t(`properties.fill_${value}`),
        }))}
        onChange={(next) => {
          if (next === 'image') {
            if (fill.type !== 'image') setPendingImageImport(true);
            return;
          }
          setPendingImageImport(false);
          onChange(fillForType(next as FillType, fill));
        }}
      />
      {projectId && (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            void saveImageAsset(projectId, file)
              .then((asset) =>
                onChange({ type: 'image', assetId: asset.id, fit: 'cover' }),
              )
              .finally(() => setPendingImageImport(false));
          }}
        />
      )}
      {pendingImageImport && fill.type !== 'image' && (
        <div className="px-2 py-1.5">
          <button
            type="button"
            className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12.5px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)]"
            onClick={pickImage}
          >
            {t('properties.importImage')}
          </button>
        </div>
      )}
      {fill.type === 'image' && (
        <>
          <SelectField
            label={t('properties.fit')}
            value={fill.fit}
            options={[
              { value: 'cover', label: t('properties.cover') },
              { value: 'contain', label: t('properties.contain') },
              { value: 'stretch', label: t('properties.stretch') },
            ]}
            onChange={(fit) =>
              onChange({ ...fill, fit: fit as typeof fill.fit })
            }
          />
          <div className="px-2 py-1.5">
            <button
              type="button"
              className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12.5px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)]"
              onClick={pickImage}
            >
              {t('properties.replaceAsset')}
            </button>
          </div>
        </>
      )}
      {!pendingImageImport && fill.type === 'solid' && (
        <ColorField
          label={t('properties.color')}
          value={fill.color}
          onChange={(color) => onChange({ type: 'solid', color })}
        />
      )}
      {!pendingImageImport &&
        (fill.type === 'linear' || fill.type === 'radial') && (
          <>
            <ColorField
              label={t('properties.gradientStart')}
              value={fill.stops[0]?.color ?? '#007AFF'}
              onChange={(color) =>
                onChange({
                  ...fill,
                  stops: [
                    { offset: 0, color },
                    fill.stops[1] ?? { offset: 1, color: '#FFFFFF' },
                  ],
                })
              }
            />
            <ColorField
              label={t('properties.gradientEnd')}
              value={fill.stops[1]?.color ?? '#FFFFFF'}
              onChange={(color) =>
                onChange({
                  ...fill,
                  stops: [
                    fill.stops[0] ?? { offset: 0, color: '#007AFF' },
                    { offset: 1, color },
                  ],
                })
              }
            />
            {fill.type === 'linear' && (
              <SliderField
                label={t('properties.gradientAngle')}
                value={fill.angle ?? 0}
                min={0}
                max={360}
                onChange={(angle) => onChange({ ...fill, angle })}
              />
            )}
          </>
        )}
      {!pendingImageImport && fill.type === 'pattern' && (
        <>
          <SelectField
            label={t('properties.pattern')}
            value={fill.pattern}
            options={PATTERN_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            onChange={(pattern) =>
              onChange({ ...fill, pattern: pattern as typeof fill.pattern })
            }
          />
          <ColorField
            label={t('properties.color')}
            value={fill.color}
            onChange={(color) => onChange({ ...fill, color })}
          />
          <ColorField
            label={t('properties.background')}
            value={fill.background}
            onChange={(background) => onChange({ ...fill, background })}
          />
          <SliderField
            label={t('properties.patternScale')}
            value={fill.scale}
            min={0.25}
            max={6}
            step={0.25}
            onChange={(scale) => onChange({ ...fill, scale })}
          />
        </>
      )}
    </div>
  );
}

/** Artboard background editor: solid / gradient / image (no pattern). */
function BackgroundFillField({
  background,
  onChange,
  projectId,
}: {
  background: BackgroundFill;
  onChange: (fill: BackgroundFill, asset?: CalqoAssetRef) => void;
  projectId: string;
}) {
  const { t } = useTranslation('editor');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [pendingImageImport, setPendingImageImport] = useState(false);
  const selectedType: BackgroundFillType = pendingImageImport
    ? 'image'
    : background.type;
  const pickImage = () => imageInputRef.current?.click();
  return (
    <div className="space-y-1">
      <SelectField
        label={t('properties.fill')}
        value={selectedType}
        options={BACKGROUND_FILL_TYPE_OPTIONS.map((value) => ({
          value,
          label: t(`properties.fill_${value}`),
        }))}
        onChange={(next) => {
          if (next === 'image') {
            if (background.type !== 'image') setPendingImageImport(true);
            return;
          }
          setPendingImageImport(false);
          onChange(
            backgroundFillForType(next as BackgroundFillType, background),
          );
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          void saveImageAsset(projectId, file)
            .then((asset) =>
              onChange(
                { type: 'image', assetId: asset.id, fit: 'cover' },
                asset,
              ),
            )
            .finally(() => setPendingImageImport(false));
        }}
      />
      {pendingImageImport && background.type !== 'image' && (
        <div className="px-2 py-1.5">
          <button
            type="button"
            className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12.5px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)]"
            onClick={pickImage}
          >
            {t('properties.importImage')}
          </button>
        </div>
      )}
      {!pendingImageImport && background.type === 'solid' && (
        <ColorField
          label={t('properties.color')}
          value={background.color}
          onChange={(color) => onChange({ type: 'solid', color })}
        />
      )}
      {!pendingImageImport &&
        (background.type === 'linear' || background.type === 'radial') && (
          <>
            <ColorField
              label={t('properties.gradientStart')}
              value={background.stops[0]?.color ?? '#007AFF'}
              onChange={(color) =>
                onChange({
                  ...background,
                  stops: [
                    { offset: 0, color },
                    background.stops[1] ?? { offset: 1, color: '#FFFFFF' },
                  ],
                })
              }
            />
            <ColorField
              label={t('properties.gradientEnd')}
              value={background.stops[1]?.color ?? '#FFFFFF'}
              onChange={(color) =>
                onChange({
                  ...background,
                  stops: [
                    background.stops[0] ?? { offset: 0, color: '#007AFF' },
                    { offset: 1, color },
                  ],
                })
              }
            />
            {background.type === 'linear' && (
              <SliderField
                label={t('properties.gradientAngle')}
                value={background.angle ?? 0}
                min={0}
                max={360}
                onChange={(angle) => onChange({ ...background, angle })}
              />
            )}
          </>
        )}
      {background.type === 'image' && (
        <>
          <SelectField
            label={t('properties.fit')}
            value={background.fit}
            options={[
              { value: 'cover', label: t('properties.cover') },
              { value: 'contain', label: t('properties.contain') },
              { value: 'stretch', label: t('properties.stretch') },
            ]}
            onChange={(fit) =>
              onChange({ ...background, fit: fit as typeof background.fit })
            }
          />
          <div className="px-2 py-1.5">
            <button
              type="button"
              className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12.5px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)]"
              onClick={pickImage}
            >
              {t('properties.replaceAsset')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const STROKE_STYLE_OPTIONS: {
  value: NonNullable<StrokeStyle['style']>;
  labelKey: string;
}[] = [
  { value: 'solid', labelKey: 'properties.styleSolid' },
  { value: 'dashed', labelKey: 'properties.styleDashed' },
  { value: 'dotted', labelKey: 'properties.styleDotted' },
];

const STROKE_EFFECT_IDS: StrokeLookId[] = STROKE_LOOK_IDS.filter(
  (id) => id !== 'dashed' && id !== 'dotted',
);

const STROKE_CAP_OPTIONS: {
  value: NonNullable<StrokeStyle['cap']>;
  labelKey: string;
}[] = [
  { value: 'butt', labelKey: 'properties.strokeCap_butt' },
  { value: 'round', labelKey: 'properties.strokeCap_round' },
  { value: 'square', labelKey: 'properties.strokeCap_square' },
];

const STROKE_JOIN_OPTIONS: {
  value: NonNullable<StrokeStyle['join']>;
  labelKey: string;
}[] = [
  { value: 'miter', labelKey: 'properties.strokeJoin_miter' },
  { value: 'round', labelKey: 'properties.strokeJoin_round' },
  { value: 'bevel', labelKey: 'properties.strokeJoin_bevel' },
];

function withStrokeDefaults(
  stroke: StrokeStyle | undefined,
  fallbackColor: string,
): StrokeStyle {
  return stroke ?? { color: fallbackColor, width: 4 };
}

function StrokeStyleField({
  value,
  onChange,
}: {
  value: NonNullable<StrokeStyle['style']>;
  onChange: (value: NonNullable<StrokeStyle['style']>) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">
        {t('properties.strokeStyle')}
      </span>
      <GlassSegmentedControl
        ariaLabel={t('properties.strokeStyle')}
        className="flex w-full [&>button]:flex-1"
        value={value}
        onChange={(next) => onChange(next as NonNullable<StrokeStyle['style']>)}
        options={STROKE_STYLE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
      />
    </div>
  );
}

/** A grid of expressive stroke-effect presets. Dash styles live in the adjacent
 * stroke style control so dashed/dotted are not duplicated in the UI. */
function StrokeLookRow({
  stroke,
  fallbackColor,
  onChange,
}: {
  stroke: StrokeStyle | undefined;
  fallbackColor: string;
  onChange: (stroke: StrokeStyle) => void;
}) {
  const { t } = useTranslation('editor');
  const active = stroke?.look ?? 'plain';
  const base = withStrokeDefaults(stroke, fallbackColor);
  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      <span className="text-[var(--calqo-text-3)] text-[12px]">{t('properties.strokeEffect')}</span>
      <div className="flex flex-wrap gap-1.5">
        {STROKE_EFFECT_IDS.map((id) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(strokeLookStyle(id as StrokeLookId, base))}
              className={`rounded-[var(--calqo-radius-sm)] border px-2.5 py-1 text-[11.5px] transition-colors ${
                selected
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent)]/10 text-[var(--calqo-text)]'
                  : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]'
              }`}
            >
              {t(`properties.strokeLook_${id}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StrokeAdvancedControls({
  stroke,
  fallbackColor,
  onChange,
}: {
  stroke: StrokeStyle | undefined;
  fallbackColor: string;
  onChange: (stroke: StrokeStyle) => void;
}) {
  const { t } = useTranslation('editor');
  const base = withStrokeDefaults(stroke, fallbackColor);
  const style = base.style ?? 'solid';
  const showDashControls = style === 'dashed' || style === 'dotted';
  return (
    <>
      {showDashControls && (
        <>
          <SliderField
            label={t('properties.strokeDash')}
            value={Math.round(base.dashLen ?? base.width * (style === 'dotted' ? 1 : 3))}
            min={0}
            max={80}
            step={0.5}
            onChange={(dashLen) => onChange({ ...base, dashLen })}
          />
          <SliderField
            label={t('properties.strokeGap')}
            value={Math.round(base.gap ?? base.width * 2)}
            min={0}
            max={80}
            step={0.5}
            onChange={(gap) => onChange({ ...base, gap })}
          />
        </>
      )}
      <SelectField
        label={t('properties.strokeCap')}
        value={base.cap ?? 'round'}
        options={STROKE_CAP_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onChange={(cap) =>
          onChange({ ...base, cap: cap as NonNullable<StrokeStyle['cap']> })
        }
      />
      <SelectField
        label={t('properties.strokeJoin')}
        value={base.join ?? 'round'}
        options={STROKE_JOIN_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onChange={(join) =>
          onChange({ ...base, join: join as NonNullable<StrokeStyle['join']> })
        }
      />
    </>
  );
}

function BrushPresetField({
  value,
  onChange,
}: {
  value: BrushStyle;
  onChange: (brushStyle: BrushStyle) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      <span className="text-[var(--calqo-text-3)] text-[12px]">
        {t('properties.brushStyle')}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {BRUSH_STYLE_IDS.map((id) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(id)}
              className={`rounded-[var(--calqo-radius-sm)] border px-2.5 py-1 text-[11.5px] transition-colors ${
                selected
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent)]/10 text-[var(--calqo-text)]'
                  : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]'
              }`}
            >
              {t(`properties.brushStyle_${id}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Shared sticker-outline section for image / svg / text / shape layers. */
function StickerControls({
  sticker,
  onChange,
}: {
  sticker: StickerOutline | undefined;
  onChange: (sticker: StickerOutline | null) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <Section title={t('properties.sticker')}>
      {!sticker ? (
        <InlineButton
          label={t('properties.stickerAdd')}
          onClick={() => onChange({ color: '#FFFFFF', width: 12 })}
        />
      ) : (
        <>
          <ColorField
            label={t('properties.color')}
            value={sticker.color}
            onChange={(color) => onChange({ ...sticker, color })}
          />
          <SliderField
            label={t('properties.strokeWidth')}
            value={Math.round(sticker.width)}
            min={1}
            max={60}
            onChange={(width) => onChange({ ...sticker, width })}
          />
          <InlineButton label={t('properties.stickerRemove')} onClick={() => onChange(null)} />
        </>
      )}
    </Section>
  );
}

const DEFAULT_FRAME_SHADOW: ShadowStyle = {
  color: '#000000',
  blur: 18,
  offsetX: 0,
  offsetY: 10,
  opacity: 0.24,
};

/** Image frame section: one-click presets, a remove chip, and numeric tuning. */
function FrameControls({
  layer,
  locale,
  update,
}: {
  layer: ImageLayer;
  locale: string;
  update: LayerUpdate;
}) {
  const { t } = useTranslation('editor');
  const frame = layer.frame;
  return (
    <Section title={t('properties.frame')}>
      <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
        {FRAME_PRESET_IDS.map((id) => {
          const selected = frame?.kind === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ frame: framePreset(id) })}
              className={`rounded-[var(--calqo-radius-sm)] border px-2.5 py-1 text-[11.5px] transition-colors ${
                selected
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent)]/10 text-[var(--calqo-text)]'
                  : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]'
              }`}
            >
              {t(`properties.framePreset_${id}`)}
            </button>
          );
        })}
      </div>
      {frame && (
        <>
          <ColorField
            label={t('properties.color')}
            value={frame.color}
            onChange={(color) => update({ frame: { ...frame, color } })}
          />
          <SliderField
            label={t('properties.strokeWidth')}
            value={Math.round(frame.width)}
            min={1}
            max={80}
            onChange={(width) => update({ frame: { ...frame, width } })}
          />
          {(frame.kind === 'rounded' || frame.kind === 'scalloped-edges') && (
            <SliderField
              label={t('properties.cornerRadius')}
              value={Math.round(frame.radius ?? 0)}
              min={0}
              max={Math.round(Math.min(layer.w, layer.h) / 2)}
              onChange={(radius) => update({ frame: { ...frame, radius } })}
            />
          )}
          {(frame.kind === 'double-line' ||
            frame.kind === 'polaroid' ||
            frame.kind === 'soft-mat' ||
            frame.kind === 'postage-stamp' ||
            frame.kind === 'photo-booth-strip') && (
            <SliderField
              label={t('properties.framePadding')}
              value={Math.round(frame.padding ?? 0)}
              min={0}
              max={60}
              onChange={(padding) => update({ frame: { ...frame, padding } })}
            />
          )}
          {(frame.kind === 'polaroid' || frame.kind === 'photo-booth-strip') && (
            <TextField
              label={t('properties.frameCaption')}
              value={frame.caption?.[locale] ?? ''}
              onChange={(caption) =>
                update({
                  frame: {
                    ...frame,
                    caption: { ...(frame.caption ?? {}), [locale]: caption },
                  },
                })
              }
            />
          )}
          {!frame.shadow ? (
            <InlineButton
              label={t('properties.frameShadowAdd')}
              onClick={() =>
                update({ frame: { ...frame, shadow: DEFAULT_FRAME_SHADOW } })
              }
            />
          ) : (
            <>
              <ColorField
                label={t('properties.shadowColor')}
                value={frame.shadow.color}
                onChange={(color) =>
                  update({ frame: { ...frame, shadow: { ...frame.shadow!, color } } })
                }
              />
              <SliderField
                label={t('properties.blur')}
                value={Math.round(frame.shadow.blur)}
                min={0}
                max={80}
                onChange={(blur) =>
                  update({ frame: { ...frame, shadow: { ...frame.shadow!, blur } } })
                }
              />
              <SliderField
                label={t('properties.shadowX')}
                value={Math.round(frame.shadow.offsetX)}
                min={-80}
                max={80}
                onChange={(offsetX) =>
                  update({ frame: { ...frame, shadow: { ...frame.shadow!, offsetX } } })
                }
              />
              <SliderField
                label={t('properties.shadowY')}
                value={Math.round(frame.shadow.offsetY)}
                min={-80}
                max={80}
                onChange={(offsetY) =>
                  update({ frame: { ...frame, shadow: { ...frame.shadow!, offsetY } } })
                }
              />
              <SliderField
                label={t('properties.opacity')}
                value={Math.round(frame.shadow.opacity * 100)}
                min={0}
                max={100}
                onChange={(opacity) =>
                  update({
                    frame: {
                      ...frame,
                      shadow: { ...frame.shadow!, opacity: opacity / 100 },
                    },
                  })
                }
              />
              <InlineButton
                label={t('properties.frameShadowRemove')}
                onClick={() => update({ frame: { ...frame, shadow: undefined } })}
              />
            </>
          )}
          <InlineButton
            label={t('properties.frameRemove')}
            onClick={() => update({ frame: null })}
          />
        </>
      )}
    </Section>
  );
}

const DEFAULT_ARROW: ArrowStyle = {
  start: false,
  end: true,
  pointerLength: 16,
  pointerWidth: 16,
  headStyle: 'triangle',
};

const ARROW_HEAD_STYLE_OPTIONS: {
  value: NonNullable<ArrowStyle['headStyle']>;
  labelKey: string;
}[] = [
  { value: 'triangle', labelKey: 'properties.arrowStyle_triangle' },
  { value: 'chevron', labelKey: 'properties.arrowStyle_chevron' },
  { value: 'bar', labelKey: 'properties.arrowStyle_bar' },
  { value: 'dot', labelKey: 'properties.arrowStyle_dot' },
];

function ArrowHeadField({
  value,
  onChange,
}: {
  value: ArrowStyle | undefined;
  onChange: (value: ArrowStyle) => void;
}) {
  const { t } = useTranslation('editor');
  const arrow = value ?? DEFAULT_ARROW;
  return (
    <>
      <SelectField
        label={t('properties.arrowStyle')}
        value={arrow.headStyle ?? 'triangle'}
        options={ARROW_HEAD_STYLE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onChange={(headStyle) =>
          onChange({
            ...arrow,
            headStyle: headStyle as NonNullable<ArrowStyle['headStyle']>,
          })
        }
      />
      <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
        <span className="text-[var(--calqo-text-3)]">
          {t('properties.arrowHeads')}
        </span>
        <div className="flex gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[var(--calqo-text-2)]">
            <input
              type="checkbox"
              checked={arrow.start}
              onChange={(event) =>
                onChange({ ...arrow, start: event.target.checked })
              }
              className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
            />
            {t('properties.arrowStart')}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[var(--calqo-text-2)]">
            <input
              type="checkbox"
              checked={arrow.end}
              onChange={(event) =>
                onChange({ ...arrow, end: event.target.checked })
              }
              className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
            />
            {t('properties.arrowEnd')}
          </label>
        </div>
      </div>
    </>
  );
}

function measureImage(
  file: File,
): Promise<{ width?: number; height?: number }> {
  if (file.type === 'image/svg+xml') return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    image.src = url;
  });
}

export function PropertiesPane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);
  const activeTool = useUiStore((s) => s.activeTool);

  if (!project || !artboard) {
    return (
      <p className="text-[12px] text-[var(--calqo-text-3)]">
        {t('workspace.empty')}
      </p>
    );
  }

  const selected = selectedIds
    .map((id) => findLayerInArtboard(artboard, id))
    .filter((layer): layer is CalqoLayer => Boolean(layer));
  const layer = selected.length === 1 ? selected[0] : null;

  if (layer) {
    return (
      <div className="flex flex-col gap-4">
        <IdentityCard
          icon={LAYER_TYPE_ICON[layer.type]}
          title={layer.name}
          subtitle={layerSubtitle(t, layer)}
        />
        <LayerControls
          projectId={project.id}
          layer={layer}
          locale={project.activeContentLocale}
          locales={project.contentLocales}
        />
      </div>
    );
  }

  if (selected.length > 1) {
    return <MultiControls projectId={project.id} layers={selected} />;
  }

  return <ToolDefaults activeTool={activeTool} />;
}

/** Localized one-line descriptor under an object's name in the identity card. */
function layerSubtitle(
  t: ReturnType<typeof useTranslation>[0],
  layer: CalqoLayer,
): string {
  if (layer.type === 'shape') {
    if (layer.shape === 'freehand') return t('properties.brush');
    if (layer.shape === 'polygon') {
      const normalized = layer.name.toLowerCase().split(' ')[0];
      if (normalized === 'triangle') return t('tools.triangle');
      if (normalized === 'diamond') return t('tools.diamond');
      if (normalized === 'badge') return t('tools.badge');
      if (normalized === 'star') return t('tools.star');
      return t('tools.polygon');
    }
    const key =
      layer.shape === 'ellipse'
        ? 'tools.ellipse'
        : layer.shape === 'line'
          ? 'tools.line'
          : 'tools.rect';
    return t(key);
  }
  const typeKey: Record<Exclude<CalqoLayer['type'], 'shape'>, string> = {
    text: 'properties.text',
    image: 'properties.image',
    svg: 'properties.svg',
    list: 'properties.list',
    group: 'panels.layers',
  };
  return t(typeKey[layer.type]);
}

/** GeoCarto's blue inspector header — an icon, the object name, and a quiet
 * type descriptor. Reused for selections and tool defaults. */
function IdentityCard({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--calqo-radius-md)] bg-[var(--calqo-accent-soft)] px-3 py-2.5 outline outline-[0.5px] outline-[var(--calqo-accent-ring)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-[var(--calqo-accent)]">
          {title}
        </span>
        <span className="block truncate text-[11px] text-[var(--calqo-text-3)]">
          {subtitle}
        </span>
      </span>
    </div>
  );
}

/** Shown when nothing is selected. For a draw tool, mirrors GeoCarto's
 * "Réglages {outil}" — the style that lands on the next placed object. */
function ToolDefaults({ activeTool }: { activeTool: EditorTool }) {
  const { t } = useTranslation('editor');
  const shapeDefaults = useUiStore((s) => s.shapeDefaults);
  const setShapeDefaults = useUiStore((s) => s.setShapeDefaults);

  if (!DRAW_TOOLS.includes(activeTool)) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-[var(--calqo-radius-md)] bg-[var(--calqo-hover)] text-[var(--calqo-text-3)]">
          <MousePointer2 size={20} />
        </span>
        <div className="space-y-1">
          <p className="text-[13px] font-semibold text-[var(--calqo-text-2)]">
            {t('properties.emptyTitle')}
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--calqo-text-3)]">
            {t('properties.emptyHint')}
          </p>
          <p className="text-[11.5px] leading-relaxed text-[var(--calqo-text-3)]">
            {t('properties.noLayerSelected')}
          </p>
        </div>
      </div>
    );
  }

  const isShapeTool = SHAPE_TOOLS.has(activeTool);
  const isPen = activeTool === 'pen';
  const isBrush = activeTool === 'brush';
  const hasFill =
    (isShapeTool && activeTool !== 'line' && activeTool !== 'arrow') || isPen;

  return (
    <div className="flex flex-col gap-4">
      <IdentityCard
        icon={TOOL_ICON[activeTool]}
        title={t('properties.toolDefaults', { tool: t(`tools.${activeTool}`) })}
        subtitle={t('properties.toolDefaultsHint')}
      />
      {(isShapeTool || isPen) && (
        <Section title={t('properties.shape')}>
          {hasFill && (
            <ColorField
              label={t('properties.fill')}
              value={shapeDefaults.fill}
              onChange={(fill) => setShapeDefaults({ fill })}
            />
          )}
          <ColorField
            label={t('properties.stroke')}
            value={shapeDefaults.stroke}
            onChange={(stroke) => setShapeDefaults({ stroke })}
          />
          <SliderField
            label={t('properties.strokeWidth')}
            value={shapeDefaults.strokeWidth}
            min={0}
            max={40}
            step={0.5}
            onChange={(strokeWidth) => setShapeDefaults({ strokeWidth })}
          />
          <StrokeStyleField
            value={shapeDefaults.strokeStyle}
            onChange={(strokeStyle) => setShapeDefaults({ strokeStyle })}
          />
        </Section>
      )}
      {isBrush && (
        <Section title={t('properties.brush')}>
          <BrushPresetField
            value={shapeDefaults.brushStyle}
            onChange={(brushStyle) =>
              setShapeDefaults({ brushStyle })
            }
          />
          <ColorField
            label={t('properties.stroke')}
            value={shapeDefaults.stroke}
            onChange={(stroke) => setShapeDefaults({ stroke })}
          />
          <SliderField
            label={t('properties.brushSize')}
            value={shapeDefaults.brushSize}
            min={1}
            max={80}
            onChange={(brushSize) => setShapeDefaults({ brushSize })}
          />
        </Section>
      )}
    </div>
  );
}

/** Multi-selection inspector: bulk edits for properties shared across the
 * selection. Type-specific controls (fill, typography) only appear when at least
 * one compatible layer is selected, and only touch those layers (plan Phase J). */
function MultiControls({
  projectId,
  layers,
}: {
  projectId: string;
  layers: CalqoLayer[];
}) {
  const { t } = useTranslation('editor');
  const ids = layers.map((l) => l.id);
  const shapeLayers = layers.filter(
    (l): l is ShapeLayerT => l.type === 'shape',
  );
  const textLayers = layers.filter(
    (l): l is TextLayer | ListLayer => l.type === 'text' || l.type === 'list',
  );
  const bulk = (
    patch: Parameters<typeof updateLayersInActiveArtboard>[2],
    targets = ids,
  ) => updateLayersInActiveArtboard(projectId, targets, patch);

  const allVisible = layers.every((l) => l.visible);
  const allLocked = layers.every((l) => l.locked);
  // Arrange acts on the unlocked, visible subset — distribute needs ≥3.
  const arrangeableCount = layers.filter((l) => !l.locked && l.visible).length;
  const canDistribute = arrangeableCount >= 3;
  const first = layers[0];
  const shapeFirst = shapeLayers[0];
  const textFirst = textLayers[0];
  const shapeIds = shapeLayers.map((l) => l.id);
  const textIds = textLayers.map((l) => l.id);
  const textFonts = useFontOptions(textFirst?.style.fontFamily);

  return (
    <div className="flex flex-col gap-4">
      <IdentityCard
        icon={Layers}
        title={t('properties.selection')}
        subtitle={`${layers.length} ${t('properties.layers').toLowerCase()}`}
      />

      <Section title={t('properties.sectionLayout')}>
        <SliderField
          label={t('properties.opacity')}
          value={Math.round((first.opacity ?? 1) * 100)}
          min={0}
          max={100}
          onChange={(opacity) => bulk({ opacity: opacity / 100 })}
        />
        <div className="flex gap-1.5 px-2 py-1.5">
          <button
            type="button"
            onClick={() => bulk({ visible: !allVisible })}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
          >
            {allVisible ? <EyeOff size={13} /> : <Eye size={13} />}
            {allVisible ? t('properties.hideAll') : t('properties.showAll')}
          </button>
          <button
            type="button"
            onClick={() => bulk({ locked: !allLocked })}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
          >
            {allLocked ? <Unlock size={13} /> : <Lock size={13} />}
            {allLocked ? t('properties.unlockAll') : t('properties.lockAll')}
          </button>
        </div>
      </Section>

      {arrangeableCount >= 2 && (
        <Section title={t('properties.arrange')}>
          <div className="grid grid-cols-6 gap-1 p-1">
            <ArrangeButton
              icon={AlignStartVertical}
              label={t('properties.alignLeft')}
              onClick={() => alignSelectedLayers(projectId, 'left')}
            />
            <ArrangeButton
              icon={AlignCenterVertical}
              label={t('properties.alignCenterH')}
              onClick={() => alignSelectedLayers(projectId, 'center-h')}
            />
            <ArrangeButton
              icon={AlignEndVertical}
              label={t('properties.alignRight')}
              onClick={() => alignSelectedLayers(projectId, 'right')}
            />
            <ArrangeButton
              icon={AlignStartHorizontal}
              label={t('properties.alignTop')}
              onClick={() => alignSelectedLayers(projectId, 'top')}
            />
            <ArrangeButton
              icon={AlignCenterHorizontal}
              label={t('properties.alignMiddle')}
              onClick={() => alignSelectedLayers(projectId, 'middle')}
            />
            <ArrangeButton
              icon={AlignEndHorizontal}
              label={t('properties.alignBottom')}
              onClick={() => alignSelectedLayers(projectId, 'bottom')}
            />
          </div>
          <div className="grid grid-cols-4 gap-1 px-1 pb-1">
            <ArrangeButton
              icon={AlignHorizontalDistributeCenter}
              label={t('properties.distributeH')}
              disabled={!canDistribute}
              onClick={() => distributeSelectedLayers(projectId, 'horizontal')}
            />
            <ArrangeButton
              icon={AlignVerticalDistributeCenter}
              label={t('properties.distributeV')}
              disabled={!canDistribute}
              onClick={() => distributeSelectedLayers(projectId, 'vertical')}
            />
            <ArrangeButton
              icon={Columns3}
              label={t('properties.stackH')}
              onClick={() => stackSelectedLayers(projectId, 'horizontal')}
            />
            <ArrangeButton
              icon={Rows3}
              label={t('properties.stackV')}
              onClick={() => stackSelectedLayers(projectId, 'vertical')}
            />
          </div>
        </Section>
      )}

      {shapeFirst && (
        <Section title={t('properties.appearance')}>
          <FillField
            fill={shapeFirst.fill}
            projectId={projectId}
            onChange={(fill) => bulk({ fill }, shapeIds)}
          />
          <ColorField
            label={t('properties.stroke')}
            value={shapeFirst.stroke?.color ?? '#007AFF'}
            onChange={(color) =>
              bulk(
                {
                  stroke: {
                    ...shapeFirst.stroke,
                    color,
                    width: shapeFirst.stroke?.width ?? 2,
                  },
                },
                shapeIds,
              )
            }
          />
          <SliderField
            label={t('properties.strokeWidth')}
            value={shapeFirst.stroke?.width ?? 0}
            min={0}
            max={40}
            step={0.5}
            onChange={(width) =>
              bulk(
                {
                  stroke:
                    width > 0
                      ? {
                          ...shapeFirst.stroke,
                          color: shapeFirst.stroke?.color ?? '#007AFF',
                          width,
                        }
                      : undefined,
                },
                shapeIds,
              )
            }
          />
        </Section>
      )}

      {textFirst && (
        <Section title={t('properties.text')}>
          <SelectField
            label={t('properties.font')}
            value={textFirst.style.fontFamily}
            options={textFonts.map((f) => ({
              value: f.family,
              label: f.family,
            }))}
            onChange={(fontFamily) => bulk({ style: { fontFamily } }, textIds)}
          />
          <SelectField
            label={t('properties.weight')}
            value={String(textFirst.style.fontWeight)}
            options={WEIGHT_OPTIONS}
            onChange={(weight) =>
              bulk({ style: { fontWeight: Number(weight) } }, textIds)
            }
          />
          <SliderField
            label={t('properties.size')}
            value={textFirst.style.fontSize}
            min={8}
            max={240}
            onChange={(fontSize) => bulk({ style: { fontSize } }, textIds)}
          />
          <AlignField
            value={textFirst.style.align}
            onChange={(align) => bulk({ style: { align } }, textIds)}
          />
          <ColorField
            label={t('properties.color')}
            value={textFirst.style.color}
            onChange={(color) => bulk({ style: { color } }, textIds)}
          />
        </Section>
      )}
    </div>
  );
}

export function DocumentControls() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();

  if (!project || !artboard) {
    return (
      <p className="text-[12px] text-[var(--calqo-text-3)]">
        {t('workspace.empty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ArtboardControls
        projectId={project.id}
        artboardId={artboard.id}
        artboard={artboard}
      />
    </div>
  );
}

function ArtboardControls({
  projectId,
  artboardId,
  artboard,
}: {
  projectId: string;
  artboardId: string;
  artboard: NonNullable<ReturnType<typeof useActiveArtboard>>;
}) {
  const { t } = useTranslation('editor');

  return (
    <>
      <Section title={t('properties.artboard')}>
        <Row label={t('properties.name')} value={artboard.name} />
        <Row
          label={t('properties.size')}
          value={`${artboard.width} x ${artboard.height}`}
          mono
        />
      </Section>
      <Section title={t('properties.background')}>
        <BackgroundFillField
          background={artboard.background}
          projectId={projectId}
          onChange={(background, asset) =>
            setArtboardBackground(projectId, artboardId, background, asset)
          }
        />
      </Section>
    </>
  );
}

function LayerControls({
  projectId,
  layer,
  locale,
  locales,
}: {
  projectId: string;
  layer: CalqoLayer;
  locale: string;
  locales: string[];
}) {
  const { t } = useTranslation('editor');
  const update = (patch: Parameters<typeof updateLayerInActiveArtboard>[2]) =>
    updateLayerInActiveArtboard(projectId, layer.id, patch);
  return (
    <>
      <Section title={t('properties.sectionLayout')}>
        <Row label={t('properties.type')} value={layer.type} mono />
        <NumberField
          label="X"
          value={layer.x}
          onChange={(x) => update({ x })}
        />
        <NumberField
          label="Y"
          value={layer.y}
          onChange={(y) => update({ y })}
        />
        <NumberField
          label="W"
          value={layer.w}
          min={1}
          onChange={(w) => update({ w })}
        />
        <NumberField
          label="H"
          value={layer.h}
          min={1}
          onChange={(h) => update({ h })}
        />
        <SliderField
          label={t('properties.rotate')}
          value={layer.rotation}
          min={-180}
          max={180}
          onChange={(rotation) => update({ rotation })}
        />
        <SliderField
          label={t('properties.opacity')}
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          onChange={(opacity) => update({ opacity: opacity / 100 })}
        />
      </Section>

      {layer.type === 'shape' && (
        <Section title={t('properties.appearance')}>
          {convertibleKind(layer) && (
            <SelectField
              label={t('properties.shape')}
              value={convertibleKind(layer) as string}
              options={SHAPE_KIND_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              onChange={(value) => {
                const kind = value as ShapeKind;
                if (
                  kind === 'triangle' ||
                  kind === 'diamond' ||
                  kind === 'badge' ||
                  kind === 'star'
                ) {
                  update({
                    name: polygonDisplayName(kind),
                    shape: 'polygon',
                    points: polygonPoints(
                      kind,
                      layer.w,
                      Math.max(1, Math.abs(layer.h)),
                    ),
                  });
                  return;
                }
                update({
                  name:
                    kind === 'line'
                      ? 'Line'
                      : kind === 'ellipse'
                        ? 'Ellipse'
                        : 'Rectangle',
                  shape: kind,
                  points: kind === 'line' ? [0, 0, layer.w, layer.h] : null,
                  cornerRadius:
                    kind === 'rect' ? (layer.cornerRadius ?? 18) : 0,
                });
              }}
            />
          )}
          {isFilledShape(layer) && (
            <FillField
              fill={layer.fill}
              projectId={projectId}
              onChange={(fill) => update({ fill })}
            />
          )}
          {layer.shape === 'freehand' && (
            <BrushPresetField
              value={brushStyleFromLayer(layer)}
              onChange={(brushStyle) =>
                update(brushStyleLayerPatch(brushStyle, layer.stroke))
              }
            />
          )}
          <ColorField
            label={t('properties.stroke')}
            value={layer.stroke?.color ?? '#007AFF'}
            onChange={(color) =>
              update({
                stroke: {
                  ...layer.stroke,
                  color,
                  width: layer.stroke?.width ?? 2,
                },
              })
            }
          />
          <SliderField
            label={t('properties.strokeWidth')}
            value={layer.stroke?.width ?? 0}
            min={0}
            max={40}
            step={0.5}
            onChange={(width) =>
              update({
                stroke:
                  width > 0
                    ? {
                        ...layer.stroke,
                        color: layer.stroke?.color ?? '#007AFF',
                        width,
                      }
                    : undefined,
              })
            }
          />
          <StrokeStyleField
            value={layer.stroke?.style ?? 'solid'}
            onChange={(style) =>
              update({
                stroke: {
                  ...layer.stroke,
                  color: layer.stroke?.color ?? '#007AFF',
                  width: layer.stroke?.width ?? 2,
                  style,
                },
              })
            }
          />
          <StrokeAdvancedControls
            stroke={layer.stroke}
            fallbackColor="#007AFF"
            onChange={(stroke) => update({ stroke })}
          />
          <StrokeLookRow
            stroke={layer.stroke}
            fallbackColor="#007AFF"
            onChange={(stroke) => update({ stroke })}
          />
          {layer.shape === 'arrow' && (
            <ArrowHeadField
              value={layer.arrow}
              onChange={(arrow) => update({ arrow })}
            />
          )}
          {layer.shape === 'rect' && (
            <SliderField
              label={t('properties.cornerRadius')}
              value={layer.cornerRadius ?? 0}
              min={0}
              max={Math.max(8, Math.round(Math.min(layer.w, layer.h) / 2))}
              onChange={(cornerRadius) => update({ cornerRadius })}
            />
          )}
        </Section>
      )}

      {layer.type === 'text' && (
        <TextControls
          projectId={projectId}
          layer={layer}
          locale={locale}
          locales={locales}
          update={update}
        />
      )}

      {layer.type === 'list' && (
        <ListControls
          projectId={projectId}
          layer={layer}
          locale={locale}
          locales={locales}
          update={update}
        />
      )}

      {layer.type === 'image' && (
        <ImageControls
          projectId={projectId}
          layer={layer}
          locale={locale}
          update={update}
        />
      )}

      {layer.type === 'svg' && (
        <Section title={t('properties.svg')}>
          <ColorField
            label={t('properties.fill')}
            value={layer.color ?? '#111827'}
            onChange={(color) => update({ color })}
          />
          {layer.color && (
            <InlineButton
              label={t('properties.resetColor')}
              onClick={() => update({ color: null })}
            />
          )}
          <ReplaceAssetButton projectId={projectId} layer={layer} />
        </Section>
      )}

      {(layer.type === 'text' ||
        layer.type === 'shape' ||
        layer.type === 'image' ||
        layer.type === 'svg') && (
        <StickerControls
          sticker={layer.sticker}
          onChange={(sticker) => update({ sticker })}
        />
      )}

      <EffectsControls layer={layer} update={update} />

      <ExportWarnings layer={layer} />
    </>
  );
}

/** Known SVG/HTML export-fidelity caveats for the selected layer, surfaced so
 * the user understands why a PNG may differ from a vector export (plan Phase J;
 * fuller export-readiness work lands in Phase K). */
function ExportWarnings({ layer }: { layer: CalqoLayer }) {
  const { t } = useTranslation('editor');
  const warnings: string[] = [];
  if (layer.blendMode && layer.blendMode !== 'normal')
    warnings.push(t('properties.warnBlend'));
  if ((layer.effects?.blur ?? 0) > 0) warnings.push(t('properties.warnBlur'));
  if (layer.type === 'image') {
    if (layer.mask) warnings.push(t('properties.warnMask'));
    if (hasActiveFilters(layer.filters))
      warnings.push(t('properties.warnFilters'));
    if (layer.frame) warnings.push(t('properties.warnFrame'));
  }
  if (layer.type === 'text' || layer.type === 'list') {
    if (layer.style.stroke || layer.style.shadow)
      warnings.push(t('properties.warnTextEffect'));
  }
  if (layer.type === 'shape' && layer.stroke?.look &&
    ['neon', 'glow', 'double', 'outline', 'marker'].includes(layer.stroke.look)) {
    warnings.push(t('properties.warnStrokeLook'));
  }
  if (layer.type !== 'group' && layer.type !== 'list' && layer.sticker) {
    warnings.push(t('properties.warnSticker'));
  }
  if (warnings.length === 0) return null;
  return (
    <Section title={t('properties.exportWarnings')}>
      <ul className="flex flex-col gap-1.5 px-2 py-1.5">
        {warnings.map((message) => (
          <li
            key={message}
            className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--calqo-text-3)]"
          >
            <AlertTriangle
              size={12}
              className="mt-0.5 shrink-0 text-[#B7791F]"
            />
            {message}
          </li>
        ))}
      </ul>
    </Section>
  );
}

type LayerUpdate = (
  patch: Parameters<typeof updateLayerInActiveArtboard>[2],
) => void;

const MASK_LABEL_KEY: Record<ImageMask['shape'], string> = {
  rounded: 'properties.maskRounded',
  circle: 'properties.maskCircle',
  ellipse: 'properties.maskEllipse',
  triangle: 'properties.maskTriangle',
  star: 'properties.maskStar',
  hexagon: 'properties.maskHexagon',
};

/** Image inspector: fit, focal point, mask, non-destructive filters, replace. */
function ImageControls({
  projectId,
  layer,
  locale,
  update,
}: {
  projectId: string;
  layer: ImageLayer;
  locale: string;
  update: LayerUpdate;
}) {
  const { t } = useTranslation('editor');
  const setCroppingLayerId = useUiStore((s) => s.setCroppingLayerId);
  const focal = layer.focalPoint ?? { x: 0.5, y: 0.5 };
  const filters = layer.filters ?? {};
  const setFilter = (key: keyof typeof FILTER_RANGES, value: number) =>
    update({ filters: { ...filters, [key]: value } });
  const maskShape = layer.mask?.shape ?? 'none';

  return (
    <>
      <Section title={t('properties.image')}>
        <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
          <span className="text-[var(--calqo-text-3)]">
            {t('properties.fit')}
          </span>
          <GlassSegmentedControl
            ariaLabel={t('properties.fit')}
            className="flex w-full [&>button]:flex-1"
            value={layer.fit}
            onChange={(fit) => update({ fit })}
            options={[
              { value: 'cover', label: t('properties.cover') },
              { value: 'contain', label: t('properties.contain') },
              { value: 'stretch', label: t('properties.stretch') },
            ]}
          />
        </div>
        {layer.fit === 'cover' && !layer.crop && (
          <>
            <SliderField
              label={t('properties.focalX')}
              value={Math.round(focal.x * 100)}
              min={0}
              max={100}
              onChange={(v) =>
                update({ focalPoint: { x: v / 100, y: focal.y } })
              }
            />
            <SliderField
              label={t('properties.focalY')}
              value={Math.round(focal.y * 100)}
              min={0}
              max={100}
              onChange={(v) =>
                update({ focalPoint: { x: focal.x, y: v / 100 } })
              }
            />
          </>
        )}
        <InlineButton
          label={t('properties.cropImage')}
          onClick={() => setCroppingLayerId(layer.id)}
        />
        {(layer.crop || layer.focalPoint) && (
          <InlineButton
            label={t('properties.resetCrop')}
            onClick={() => update({ crop: null, focalPoint: null })}
          />
        )}
        <ReplaceAssetButton projectId={projectId} layer={layer} />
      </Section>

      <Section title={t('properties.mask')}>
        <SelectField
          label={t('properties.mask')}
          value={maskShape}
          options={[
            { value: 'none', label: t('properties.maskNone') },
            ...MASK_SHAPES.map((shape) => ({
              value: shape,
              label: t(MASK_LABEL_KEY[shape]),
            })),
          ]}
          onChange={(value) => {
            if (value === 'none') {
              update({ mask: null });
              return;
            }
            const shape = value as ImageMask['shape'];
            update({
              mask: {
                shape,
                radius:
                  shape === 'rounded'
                    ? (layer.mask?.radius ?? Math.min(layer.w, layer.h) * 0.12)
                    : undefined,
              },
            });
          }}
        />
        {layer.mask?.shape === 'rounded' && (
          <SliderField
            label={t('properties.maskRadius')}
            value={Math.round(layer.mask.radius ?? 0)}
            min={0}
            max={Math.round(Math.min(layer.w, layer.h) / 2)}
            onChange={(radius) =>
              update({ mask: { shape: 'rounded', radius } })
            }
          />
        )}
      </Section>

      <Section title={t('properties.filters')}>
        <SliderField
          label={t('properties.brightness')}
          value={Math.round((filters.brightness ?? 0) * 100)}
          min={FILTER_RANGES.brightness.min * 100}
          max={FILTER_RANGES.brightness.max * 100}
          onChange={(v) => setFilter('brightness', v / 100)}
        />
        <SliderField
          label={t('properties.contrast')}
          value={Math.round(filters.contrast ?? 0)}
          min={FILTER_RANGES.contrast.min}
          max={FILTER_RANGES.contrast.max}
          onChange={(v) => setFilter('contrast', v)}
        />
        <SliderField
          label={t('properties.saturation')}
          value={Math.round((filters.saturation ?? 0) * 100)}
          min={FILTER_RANGES.saturation.min * 100}
          max={FILTER_RANGES.saturation.max * 100}
          onChange={(v) => setFilter('saturation', v / 100)}
        />
        <SliderField
          label={t('properties.blur')}
          value={Math.round(filters.blur ?? 0)}
          min={FILTER_RANGES.blur.min}
          max={FILTER_RANGES.blur.max}
          onChange={(v) => setFilter('blur', v)}
        />
        {hasActiveFilters(layer.filters) && (
          <InlineButton
            label={t('properties.resetFilters')}
            onClick={() => update({ filters: null })}
          />
        )}
      </Section>

      <FrameControls layer={layer} locale={locale} update={update} />
    </>
  );
}

const BLEND_OPTIONS: NonNullable<CalqoLayer['blendMode']>[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
];

const DEFAULT_EFFECT_SHADOW: ShadowStyle = {
  color: '#000000',
  blur: 16,
  offsetX: 0,
  offsetY: 8,
  opacity: 0.3,
};

/** Recompute the effects object after a partial change, dropping it entirely
 * when nothing is active so `.calqo` files stay clean. */
function nextEffects(
  current: CalqoLayer['effects'],
  patch: Partial<NonNullable<CalqoLayer['effects']>>,
): NonNullable<CalqoLayer['effects']> | null {
  const merged = { ...current, ...patch };
  const blur = (merged.blur ?? 0) > 0 ? merged.blur : undefined;
  if (!merged.shadow && !blur) return null;
  return { shadow: merged.shadow, blur };
}

/** Dedicated effects section: blur, drop shadow, and blend mode (plan Phase I).
 * Text keeps its own type shadow in Typography, so only blur + blend show here. */
function EffectsControls({
  layer,
  update,
}: {
  layer: CalqoLayer;
  update: LayerUpdate;
}) {
  const { t } = useTranslation('editor');
  const effects = layer.effects;
  const shadow = effects?.shadow;
  const showShadow = layer.type !== 'text' && layer.type !== 'list';

  return (
    <Section title={t('properties.effects')}>
      <SliderField
        label={t('properties.blur')}
        value={Math.round(effects?.blur ?? 0)}
        min={0}
        max={40}
        onChange={(blur) => update({ effects: nextEffects(effects, { blur }) })}
      />
      <SelectField
        label={t('properties.blendMode')}
        value={layer.blendMode ?? 'normal'}
        options={BLEND_OPTIONS.map((mode) => ({
          value: mode,
          label: t(`properties.blend_${mode}`),
        }))}
        onChange={(mode) =>
          update({ blendMode: mode as CalqoLayer['blendMode'] })
        }
      />
      {showShadow && (
        <>
          <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[12px] text-[var(--calqo-text-2)]">
            <input
              type="checkbox"
              checked={Boolean(shadow)}
              onChange={(event) =>
                update({
                  effects: nextEffects(effects, {
                    shadow: event.target.checked
                      ? DEFAULT_EFFECT_SHADOW
                      : undefined,
                  }),
                })
              }
              className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
            />
            {t('properties.shadowEnable')}
          </label>
          {shadow && (
            <>
              <ColorField
                label={t('properties.color')}
                value={shadow.color}
                onChange={(color) =>
                  update({
                    effects: nextEffects(effects, {
                      shadow: { ...shadow, color },
                    }),
                  })
                }
              />
              <SliderField
                label={t('properties.blur')}
                value={Math.round(shadow.blur)}
                min={0}
                max={60}
                onChange={(blur) =>
                  update({
                    effects: nextEffects(effects, {
                      shadow: { ...shadow, blur },
                    }),
                  })
                }
              />
              <NumberField
                label="X"
                value={shadow.offsetX}
                onChange={(offsetX) =>
                  update({
                    effects: nextEffects(effects, {
                      shadow: { ...shadow, offsetX },
                    }),
                  })
                }
              />
              <NumberField
                label="Y"
                value={shadow.offsetY}
                onChange={(offsetY) =>
                  update({
                    effects: nextEffects(effects, {
                      shadow: { ...shadow, offsetY },
                    }),
                  })
                }
              />
              <SliderField
                label={t('properties.opacity')}
                value={Math.round((shadow.opacity ?? 1) * 100)}
                min={0}
                max={100}
                onChange={(opacity) =>
                  update({
                    effects: nextEffects(effects, {
                      shadow: { ...shadow, opacity: opacity / 100 },
                    }),
                  })
                }
              />
            </>
          )}
        </>
      )}
    </Section>
  );
}

const WEIGHT_OPTIONS: { value: string; label: string }[] = [];

const DEFAULT_TEXT_SHADOW: ShadowStyle = {
  color: '#000000',
  blur: 8,
  offsetX: 0,
  offsetY: 4,
  opacity: 0.35,
};

/** GeoCarto-style text inspector: full type controls plus per-locale variants. */
function TextControls({
  projectId,
  layer,
  locale,
  locales,
  update,
}: {
  projectId: string;
  layer: TextLayer;
  locale: string;
  locales: string[];
  update: (patch: Parameters<typeof updateLayerInActiveArtboard>[2]) => void;
}) {
  const { t } = useTranslation('editor');
  const shadow = layer.style.shadow;
  return (
    <>
      <Section title={t('properties.text')}>
        <TextVariants
          projectId={projectId}
          layer={layer}
          locales={locales}
          activeLocale={locale}
        />
      </Section>

      <Section title={t('properties.presets')}>
        <TextPresetRow
          onApply={(id) => update({ style: textPresetStyle(id) })}
        />
      </Section>

      <TypographyControls
        style={layer.style}
        onChange={(style) => update({ style })}
      />

      <TextStrokeControls
        style={layer.style}
        onChange={(style) => update({ style })}
      />

      <TextShadowControls
        shadow={shadow}
        onChange={(shadow) => update({ style: { shadow } })}
      />
    </>
  );
}

/** Shared typography section (font / weight / size / align / line-height /
 * letter-spacing / color) — used by both text and list layers so a list keeps
 * every text-editing feature. */
function TypographyControls({
  style,
  onChange,
}: {
  style: TextLayer['style'];
  onChange: (style: Partial<TextLayer['style']>) => void;
}) {
  const { t } = useTranslation('editor');
  const fontOptions = useFontOptions(style.fontFamily);
  const variants = useFontVariants(style.fontFamily);
  return (
    <Section title={t('properties.typography')}>
      <FontMenuField
        label={t('properties.font')}
        value={style.fontFamily}
        fonts={fontOptions}
        onChange={(fontFamily) => onChange({ fontFamily })}
      />
      <InspectorStyleButtons
        style={style}
        variants={variants}
        onChange={(patch) => onChange(patch)}
      />
      <SliderField
        label={t('properties.size')}
        value={style.fontSize}
        min={8}
        max={240}
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <AlignField
        value={style.align}
        onChange={(align) => onChange({ align })}
      />
      <VerticalAlignField
        value={style.verticalAlign ?? 'top'}
        onChange={(verticalAlign) => onChange({ verticalAlign })}
      />
      <SliderField
        label={t('properties.lineHeight')}
        value={style.lineHeight}
        min={0.8}
        max={3}
        step={0.05}
        onChange={(lineHeight) => onChange({ lineHeight })}
      />
      <SliderField
        label={t('properties.letterSpacing')}
        value={style.letterSpacing}
        min={-10}
        max={40}
        step={0.5}
        onChange={(letterSpacing) => onChange({ letterSpacing })}
      />
      <ColorField
        label={t('properties.color')}
        value={style.color}
        onChange={(color) => onChange({ color })}
      />
    </Section>
  );
}

/** Inspector-row wrapper for the shared style buttons component. */
function InspectorStyleButtons({
  style,
  variants,
  onChange,
}: {
  style: TextLayer['style'];
  variants: ReturnType<typeof useFontVariants>;
  onChange: (patch: Partial<TextLayer['style']>) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">
        {t('properties.style')}
      </span>
      <TextStyleButtons
        fontWeight={Number(style.fontWeight) || 400}
        fontStyle={style.fontStyle}
        textDecoration={style.textDecoration}
        color={style.color}
        hasItalic={variants.hasItalic}
        availableWeights={variants.weights}
        onChange={onChange}
      />
    </div>
  );
}

/** Shared text stroke section — used by text and list layers. */
function TextStrokeControls({
  style,
  onChange,
}: {
  style: TextLayer['style'];
  onChange: (style: Partial<TextLayer['style']>) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <Section title={t('properties.stroke')}>
      <ColorField
        label={t('properties.color')}
        value={style.stroke?.color ?? '#000000'}
        onChange={(color) =>
          onChange({ stroke: { color, width: style.stroke?.width ?? 1 } })
        }
      />
      <SliderField
        label={t('properties.strokeWidth')}
        value={style.stroke?.width ?? 0}
        min={0}
        max={20}
        step={0.5}
        onChange={(width) =>
          onChange({
            stroke:
              width > 0
                ? { color: style.stroke?.color ?? '#000000', width }
                : undefined,
          })
        }
      />
      {style.stroke && style.stroke.width > 0 && (
        <>
          <StrokeStyleField
            value={style.stroke.style ?? 'solid'}
            onChange={(strokeStyle) =>
              onChange({ stroke: { ...style.stroke!, style: strokeStyle } })
            }
          />
          <StrokeAdvancedControls
            stroke={style.stroke}
            fallbackColor="#000000"
            onChange={(stroke) => onChange({ stroke })}
          />
          <StrokeLookRow
            stroke={style.stroke}
            fallbackColor="#000000"
            onChange={(stroke) => onChange({ stroke })}
          />
        </>
      )}
    </Section>
  );
}

/** Shared text shadow section — used by text and list layers. */
function TextShadowControls({
  shadow,
  onChange,
}: {
  shadow: ShadowStyle | undefined;
  onChange: (shadow: ShadowStyle | undefined) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <Section title={t('properties.shadow')}>
      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[12px] text-[var(--calqo-text-2)]">
        <input
          type="checkbox"
          checked={Boolean(shadow)}
          onChange={(event) =>
            onChange(event.target.checked ? DEFAULT_TEXT_SHADOW : undefined)
          }
          className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
        />
        {t('properties.shadowEnable')}
      </label>
      {shadow && (
        <>
          <ColorField
            label={t('properties.color')}
            value={shadow.color}
            onChange={(color) => onChange({ ...shadow, color })}
          />
          <SliderField
            label={t('properties.blur')}
            value={shadow.blur}
            min={0}
            max={60}
            onChange={(blur) => onChange({ ...shadow, blur })}
          />
          <NumberField
            label="X"
            value={shadow.offsetX}
            onChange={(offsetX) => onChange({ ...shadow, offsetX })}
          />
          <NumberField
            label="Y"
            value={shadow.offsetY}
            onChange={(offsetY) => onChange({ ...shadow, offsetY })}
          />
          <SliderField
            label={t('properties.opacity')}
            value={Math.round((shadow.opacity ?? 1) * 100)}
            min={0}
            max={100}
            onChange={(opacity) =>
              onChange({ ...shadow, opacity: opacity / 100 })
            }
          />
        </>
      )}
    </Section>
  );
}

const MARKER_KIND_OPTIONS: { value: ListMarker['kind']; labelKey: string }[] = [
  { value: 'bullet', labelKey: 'list.markerBullet' },
  { value: 'dash', labelKey: 'list.markerDash' },
  { value: 'arrow', labelKey: 'list.markerArrow' },
  { value: 'none', labelKey: 'list.markerNone' },
  { value: 'character', labelKey: 'list.markerCharacter' },
  { value: 'asset', labelKey: 'list.markerAsset' },
];

/** Load an asset blob into an object URL for use as an <img> thumbnail. */
function useAssetThumbnail(assetId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    if (!assetId) {
      setUrl(null);
      return undefined;
    }
    void assetStorage.getAssetBlob(assetId).then((blob) => {
      if (!alive) return;
      if (!blob) {
        setUrl(null);
        return;
      }
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [assetId]);
  return url;
}

/** Grid of already-imported assets the user can pick as a list marker, plus an
 * upload button to add a new one inline. */
function MarkerAssetPicker({
  projectId,
  layerId,
  selectedAssetId,
  onPick,
}: {
  projectId: string;
  layerId: string;
  selectedAssetId: string | undefined;
  onPick: (asset: CalqoAssetRef) => void;
}) {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const setSvgDialog = useUiStore((s) => s.setSvgDialog);
  const setMarkerPickerLayerId = useUiStore((s) => s.setMarkerPickerLayerId);
  const inputRef = useRef<HTMLInputElement>(null);
  const assets = (project?.assets ?? [])
    .filter((a) => a.kind === 'svg')
    .slice()
    .reverse();

  const onUpload = (file: File) => {
    void measureImage(file).then(async (measured) => {
      const asset = await assetStorage.saveAsset(projectId, file, {
        kind: file.type === 'image/svg+xml' ? 'svg' : 'raster',
        name: file.name,
        mimeType: file.type,
        width: measured.width,
        height: measured.height,
      });
      onPick(asset);
    });
  };

  const openLibrary = () => {
    setMarkerPickerLayerId(layerId);
    setSvgDialog(true);
  };

  return (
    <div className="px-2 py-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = '';
        }}
      />
      {assets.length === 0 ? (
        <p className="px-1 py-2 text-[11.5px] leading-relaxed text-[var(--calqo-text-3)]">
          {t('list.noAssets')}
        </p>
      ) : (
        <div className="grid max-h-40 grid-cols-5 gap-1.5 overflow-y-auto">
          {assets.map((asset) => (
            <AssetThumbButton
              key={asset.id}
              asset={asset}
              selected={asset.id === selectedAssetId}
              onClick={() => onPick(asset)}
            />
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={openLibrary}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent)] px-3 text-[12px] font-medium text-[var(--calqo-text-on-accent)] transition-opacity hover:opacity-90"
        >
          <Shapes size={13} />
          {t('list.pickAsset')}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-8 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)]"
          aria-label={t('properties.replaceAsset')}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

function AssetThumbButton({
  asset,
  selected,
  onClick,
}: {
  asset: CalqoAssetRef;
  selected: boolean;
  onClick: () => void;
}) {
  const url = useAssetThumbnail(asset.id);
  return (
    <button
      type="button"
      title={asset.name}
      aria-pressed={selected}
      onClick={onClick}
      className={[
        'grid aspect-square place-items-center overflow-hidden rounded-[var(--calqo-radius-sm)] border bg-[var(--calqo-glass)] transition-colors',
        selected
          ? 'border-[var(--calqo-accent)] ring-2 ring-[var(--calqo-accent-ring)]'
          : 'border-[var(--calqo-divider)] hover:bg-[var(--calqo-hover)]',
      ].join(' ')}
    >
      {url ? (
        <img
          src={url}
          alt={asset.name}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <ImageIcon size={14} className="text-[var(--calqo-text-3)]" />
      )}
    </button>
  );
}

/** A single list row editor: reorder handles, per-locale textareas, delete. */
function ListItemRow({
  projectId,
  layerId,
  row,
  index,
  count,
  locale,
  locales,
  expanded,
  onToggleExpand,
}: {
  projectId: string;
  layerId: string;
  row: ListLayer['items'][number];
  index: number;
  count: number;
  locale: string;
  locales: string[];
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { t } = useTranslation('editor');
  const otherLocales = locales.filter((l) => l !== locale);
  return (
    <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] p-1.5">
      <div className="mb-1 flex items-center gap-1">
        <span className="mono px-1 text-[10px] text-[var(--calqo-text-3)]">
          {index + 1}
        </span>
        <div className="flex flex-1 items-center justify-end gap-0.5">
          <button
            type="button"
            aria-label={t('list.moveUp')}
            disabled={index === 0}
            onClick={() =>
              reorderListItem(projectId, layerId, index, index - 1)
            }
            className="rounded p-1 text-[var(--calqo-text-3)] transition-colors enabled:hover:bg-[var(--calqo-hover)] enabled:hover:text-[var(--calqo-text)] disabled:opacity-30"
          >
            <ArrowUp size={12} />
          </button>
          <button
            type="button"
            aria-label={t('list.moveDown')}
            disabled={index === count - 1}
            onClick={() =>
              reorderListItem(projectId, layerId, index, index + 1)
            }
            className="rounded p-1 text-[var(--calqo-text-3)] transition-colors enabled:hover:bg-[var(--calqo-hover)] enabled:hover:text-[var(--calqo-text)] disabled:opacity-30"
          >
            <ArrowDown size={12} />
          </button>
          <button
            type="button"
            aria-label={t('list.deleteRow')}
            disabled={count <= 1}
            onClick={() => removeListItem(projectId, layerId, row.id)}
            className="rounded p-1 text-[var(--calqo-text-3)] transition-colors enabled:hover:bg-[#FF3B30]/15 enabled:hover:text-[#FF3B30] disabled:opacity-30"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <textarea
        value={row.text[locale] ?? ''}
        placeholder={t('content.emptyVariant')}
        onChange={(event) =>
          updateListItemTextForLocale(
            projectId,
            layerId,
            row.id,
            locale,
            event.target.value,
          )
        }
        className="min-h-9 w-full resize-y rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-1 focus:ring-[var(--calqo-accent-ring)]"
      />
      {otherLocales.length > 0 && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-1 flex items-center gap-1 px-1 text-[10px] text-[var(--calqo-accent)] transition-opacity hover:opacity-80"
        >
          {expanded ? t('list.hideLocales') : t('list.showLocales')}
        </button>
      )}
      {expanded &&
        otherLocales.map((other) => {
          const value = row.text[other];
          const missing = value === undefined;
          return (
            <div key={other} className="mt-1.5">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="mono text-[9px] uppercase text-[var(--calqo-text-3)]">
                  {other}
                </span>
                {missing && (
                  <span className="text-[9px] text-[#B7791F]">
                    {t('content.missingVariant')}
                  </span>
                )}
              </div>
              <textarea
                value={value ?? ''}
                placeholder={t('content.emptyVariant')}
                onChange={(event) =>
                  updateListItemTextForLocale(
                    projectId,
                    layerId,
                    row.id,
                    other,
                    event.target.value,
                  )
                }
                className="min-h-8 w-full resize-y rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-1 focus:ring-[var(--calqo-accent-ring)]"
              />
            </div>
          );
        })}
    </div>
  );
}

/** List inspector: rows (add / reorder / per-locale edit), marker config, and
 * the full shared typography / stroke / shadow controls. */
function ListControls({
  projectId,
  layer,
  locale,
  locales,
  update,
}: {
  projectId: string;
  layer: ListLayer;
  locale: string;
  locales: string[];
  update: (patch: Parameters<typeof updateLayerInActiveArtboard>[2]) => void;
}) {
  const { t } = useTranslation('editor');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const marker = layer.marker;

  const toggleExpand = (rowId: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

  return (
    <>
      <Section title={t('list.items')}>
        <div className="flex flex-col gap-1.5 p-1">
          {layer.items.map((row, index) => (
            <ListItemRow
              key={row.id}
              projectId={projectId}
              layerId={layer.id}
              row={row}
              index={index}
              count={layer.items.length}
              locale={locale}
              locales={locales}
              expanded={expandedRows.has(row.id)}
              onToggleExpand={() => toggleExpand(row.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => addListItem(projectId, layer.id)}
            className="mt-0.5 flex h-8 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-dashed border-[var(--calqo-divider)] text-[12px] text-[var(--calqo-text-2)] transition-colors hover:border-[var(--calqo-accent)] hover:text-[var(--calqo-accent)]"
          >
            <Plus size={13} />
            {t('list.addItem')}
          </button>
          {layer.overflow?.hasOverflow && (
            <div className="flex items-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-2.5 py-1.5 text-[11px] text-[#B7791F]">
              <AlertTriangle size={12} />
              {t(`content.overflow.${layer.overflow.suggestedAction}`)}
            </div>
          )}
        </div>
      </Section>

      <Section title={t('list.marker')}>
        <SelectField
          label={t('list.markerKind')}
          value={marker.kind}
          options={MARKER_KIND_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(opt.labelKey),
          }))}
          onChange={(kind) =>
            update({ marker: { kind: kind as ListMarker['kind'] } })
          }
        />
        {marker.kind === 'character' && (
          <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
            <span className="text-[var(--calqo-text-3)]">
              {t('list.character')}
            </span>
            <input
              type="text"
              value={marker.character ?? ''}
              maxLength={4}
              placeholder="✦"
              onChange={(event) =>
                update({ marker: { character: event.target.value } })
              }
              className="h-8 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
            />
          </div>
        )}
        {marker.kind === 'asset' && (
          <MarkerAssetPicker
            projectId={projectId}
            layerId={layer.id}
            selectedAssetId={marker.assetId}
            onPick={(asset) =>
              setListMarker(projectId, layer.id, { assetId: asset.id }, asset)
            }
          />
        )}
        {marker.kind !== 'none' && (
          <>
            <ColorField
              label={t('list.markerColor')}
              value={marker.color}
              onChange={(color) => update({ marker: { color } })}
            />
            <SliderField
              label={t('list.markerSize')}
              value={marker.size ?? layer.style.fontSize}
              min={6}
              max={120}
              onChange={(size) => update({ marker: { size } })}
            />
            <SliderField
              label={t('list.markerGap')}
              value={layer.markerGap}
              min={0}
              max={48}
              step={1}
              onChange={(markerGap) => update({ markerGap })}
            />
          </>
        )}
      </Section>

      <Section title={t('list.presets')}>
        <TextPresetRow
          onApply={(id) => update({ style: textPresetStyle(id) })}
        />
      </Section>

      <TypographyControls
        style={layer.style}
        onChange={(style) => update({ style })}
      />

      <TextStrokeControls
        style={layer.style}
        onChange={(style) => update({ style })}
      />

      <TextShadowControls
        shadow={layer.style.shadow}
        onChange={(shadow) => update({ style: { shadow } })}
      />
    </>
  );
}

function ReplaceAssetButton({
  projectId,
  layer,
}: {
  projectId: string;
  layer: Extract<CalqoLayer, { type: 'image' | 'svg' }>;
}) {
  const { t } = useTranslation('editor');
  const inputRef = useRef<HTMLInputElement>(null);
  const accept =
    layer.type === 'svg' ? 'image/svg+xml' : 'image/png,image/jpeg,image/webp';
  return (
    <div className="px-2 py-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void measureImage(file).then(async (measured) => {
            const asset = await assetStorage.saveAsset(projectId, file, {
              kind: file.type === 'image/svg+xml' ? 'svg' : 'raster',
              name: file.name,
              mimeType: file.type,
              width: measured.width,
              height: measured.height,
            });
            replaceLayerAsset(projectId, layer.id, asset);
          });
          event.currentTarget.value = '';
        }}
      />
      <button
        type="button"
        className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12.5px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)]"
        onClick={() => inputRef.current?.click()}
      >
        {t('properties.replaceAsset')}
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <span className="eyebrow">{title}</span>
      </div>
      <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <span
        className={`truncate text-[var(--calqo-text-2)] ${mono ? 'mono text-[11px]' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[12.5px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[12.5px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
      />
    </label>
  );
}

/** Paired slider + number field for high-frequency numeric values. The slider
 * gives a fast tactile sweep; the number keeps exact entry (plan Phase I/J). */
function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const safe = Number.isFinite(value) ? value : min;
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="range"
          aria-label={label}
          value={safe}
          min={min}
          max={max}
          step={step}
          // A drag fires many change events; coalesce them into one undo step.
          onPointerDown={beginHistoryCoalescing}
          onPointerUp={endHistoryCoalescing}
          onBlur={endHistoryCoalescing}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--calqo-accent)]"
        />
        <input
          type="number"
          aria-label={`${label} value`}
          value={Math.round(safe * 100) / 100}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(clamp(next));
          }}
          className="h-8 w-14 shrink-0 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
        />
      </div>
    </div>
  );
}

/** Square icon button for the multi-selection align/distribute/stack grid. */
function ArrangeButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-8 items-center justify-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon size={14} />
    </button>
  );
}

/** A quiet full-width text button used for inline reset actions. */
function InlineButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="px-2 py-1.5">
      <button
        type="button"
        onClick={onClick}
        className="h-8 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-3 text-[12px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
      >
        {label}
      </button>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12.5px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const ALIGN_OPTIONS: {
  value: TextLayer['style']['align'];
  icon: LucideIcon;
}[] = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
  { value: 'justify', icon: AlignJustify },
];

function AlignField({
  value,
  onChange,
}: {
  value: TextLayer['style']['align'];
  onChange: (value: TextLayer['style']['align']) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">
        {t('properties.align')}
      </span>
      <div
        role="radiogroup"
        aria-label={t('properties.align')}
        className="glass-thin inline-flex gap-0.5 rounded-[var(--calqo-radius-sm)] p-0.5"
      >
        {ALIGN_OPTIONS.map(({ value: option, icon: Icon }) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option}
              onClick={() => onChange(option)}
              className={[
                'flex h-6 flex-1 items-center justify-center rounded-[6px] transition-colors duration-[var(--calqo-t-fast)]',
                active
                  ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                  : 'text-[var(--calqo-text-2)] hover:text-[var(--calqo-text)]',
              ].join(' ')}
            >
              <Icon size={13} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Headline / subhead / kicker … chips that retune a text layer's type style. */
function TextPresetRow({ onApply }: { onApply: (id: TextPresetId) => void }) {
  const { t } = useTranslation('editor');
  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
      {TEXT_PRESET_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onApply(id)}
          className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-2.5 py-1 text-[11.5px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
        >
          {t(`properties.preset_${id}`)}
        </button>
      ))}
    </div>
  );
}

function VerticalAlignField({
  value,
  onChange,
}: {
  value: NonNullable<TextLayer['style']['verticalAlign']>;
  onChange: (value: NonNullable<TextLayer['style']['verticalAlign']>) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <SelectField
      label={t('properties.verticalAlign')}
      value={value}
      options={[
        { value: 'top', label: t('properties.valignTop') },
        { value: 'middle', label: t('properties.valignMiddle') },
        { value: 'bottom', label: t('properties.valignBottom') },
      ]}
      onChange={(v) =>
        onChange(v as NonNullable<TextLayer['style']['verticalAlign']>)
      }
    />
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pipetteStatus, setPipetteStatus] = useState<string | null>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const nativeColorRef = useRef<HTMLInputElement>(null);
  const normalized = value.toUpperCase();
  // `<input type="color">` only accepts #rrggbb; fall back to black otherwise.
  const nativeColorValue = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  const baseSwatches = [
    ...(project?.palette.map((color) => color.toUpperCase()) ?? []),
    ...COLOR_SWATCHES,
  ].filter((color, index, colors) => colors.indexOf(color) === index);
  const swatches = baseSwatches.includes(normalized)
    ? baseSwatches.slice(0, 10)
    : [normalized, ...baseSwatches].slice(0, 10);
  const pickWithEyedropper = async () => {
    // Chromium: the in-page EyeDropper API samples anywhere on screen.
    if (window.EyeDropper) {
      setPipetteStatus(t('color.pickWaiting'));
      try {
        const result = await new window.EyeDropper().open();
        onChange(result.sRGBHex.toUpperCase());
        setPipetteStatus(t('color.picked'));
        window.setTimeout(() => setPipetteStatus(null), 1400);
      } catch {
        setPipetteStatus(t('color.pickCancelled'));
      }
      return;
    }
    // Safari/WebKit ships no EyeDropper — sample straight from the design
    // canvas, which works reliably in every browser.
    if (isStageSamplerAvailable()) {
      setPipetteStatus(t('color.pickWaiting'));
      const hex = await sampleColorFromStage();
      if (hex) {
        onChange(hex.toUpperCase());
        setPipetteStatus(t('color.picked'));
        window.setTimeout(() => setPipetteStatus(null), 1400);
      } else {
        setPipetteStatus(t('color.pickCancelled'));
      }
      return;
    }
    // Last resort: the native color panel (its macOS magnifier can sample).
    nativeColorRef.current?.click();
  };

  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {swatches.map((color) => {
            const active = color.toLowerCase() === normalized.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                aria-label={`${label} ${color}`}
                onClick={() => onChange(color)}
                className={[
                  'h-7 w-7 shrink-0 rounded-[8px] border transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] hover:scale-[1.1]',
                  active
                    ? 'border-[var(--calqo-accent)] ring-2 ring-[var(--calqo-accent-ring)]'
                    : 'border-black/10',
                ].join(' ')}
                style={{ background: color }}
              />
            );
          })}
          <button
            ref={pickerRef}
            type="button"
            aria-label={`${label} ${t('color.custom')}`}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
            className="h-7 w-7 shrink-0 rounded-[8px] border border-[var(--calqo-divider)] shadow-[0_0_0_2px_var(--calqo-glass-thin)_inset] transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] hover:scale-[1.1]"
            style={{
              background:
                'conic-gradient(from 90deg, #ff3b30, #ffcc00, #34c759, #32ade6, #5856d6, #ff2d55, #ff3b30)',
            }}
          />
          <button
            type="button"
            aria-label={`${label} ${t('color.pickFromScreen')}`}
            onClick={pickWithEyedropper}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] text-[var(--calqo-text-2)] transition-colors hover:text-[var(--calqo-text)]"
          >
            <Pipette size={13} />
          </button>
          <input
            ref={nativeColorRef}
            type="color"
            aria-hidden
            tabIndex={-1}
            value={nativeColorValue}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
        </div>
        {pipetteStatus && (
          <p className="mt-1 text-[10.5px] text-[var(--calqo-text-3)]">
            {pipetteStatus}
          </p>
        )}
        <ColorPickerPopover
          open={pickerOpen}
          anchorRef={pickerRef}
          value={value}
          onChange={onChange}
          onClose={() => setPickerOpen(false)}
        />
      </div>
    </div>
  );
}
