import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Badge,
  Brush,
  Circle,
  Diamond,
  Folder,
  Hand,
  Image as ImageIcon,
  Layers,
  Minus,
  MousePointer2,
  BoxSelect,
  MoveUpRight,
  PenTool,
  Pipette,
  Shapes,
  Square,
  Star,
  Triangle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { assetStorage } from '@/lib/adapters';
import { BUNDLED_FONTS } from '@/lib/adapters/fonts/browserFontAdapter';
import {
  polygonPoints,
  type PolygonPreset,
  updateLayerInActiveArtboard,
  editProject,
  replaceLayerAsset,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { GlassSegmentedControl } from '@/components/glass';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore, type EditorTool } from '@/lib/state/uiStore';
import type { ArrowStyle, CalqoLayer, Fill, ShadowStyle, StrokeStyle, TextLayer } from '@/lib/schema';
import {
  isStageSamplerAvailable,
  sampleColorFromStage,
} from '@/editor/canvas/stageSampler';
import { ColorPickerPopover } from './ColorPickerPopover';
import { TextVariants } from './ContentControls';

const LAYER_TYPE_ICON: Record<CalqoLayer['type'], LucideIcon> = {
  text: Type,
  shape: Square,
  image: ImageIcon,
  svg: Shapes,
  group: Folder,
};

const TOOL_ICON: Record<EditorTool, LucideIcon> = {
  select: MousePointer2,
  marquee: BoxSelect,
  pan: Hand,
  text: Type,
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
  return kind === 'badge' ? 'Badge' : kind.charAt(0).toUpperCase() + kind.slice(1);
}

type ShapeLayerT = Extract<CalqoLayer, { type: 'shape' }>;

/** The shape-kind shown in the convert dropdown, or null for shapes that should
 * not be reshaped through it (arrows, freehand strokes, custom polygons). */
function convertibleKind(layer: ShapeLayerT): ShapeKind | null {
  if (layer.shape === 'rect' || layer.shape === 'ellipse' || layer.shape === 'line') {
    return layer.shape;
  }
  if (layer.shape === 'polygon') {
    const normalized = layer.name.toLowerCase().split(' ')[0];
    if (normalized === 'triangle' || normalized === 'diamond' || normalized === 'badge' || normalized === 'star') {
      return normalized;
    }
  }
  return null;
}

/** Shapes that paint an interior fill (everything except open strokes). */
function isFilledShape(layer: ShapeLayerT): boolean {
  return layer.shape !== 'line' && layer.shape !== 'arrow' && layer.shape !== 'freehand';
}

const FILL_TYPE_OPTIONS = ['solid', 'linear', 'radial', 'pattern'] as const;
type FillType = (typeof FILL_TYPE_OPTIONS)[number];

const PATTERN_OPTIONS: { value: Extract<Fill, { type: 'pattern' }>['pattern']; labelKey: string }[] = [
  { value: 'dots', labelKey: 'properties.patternDots' },
  { value: 'grid', labelKey: 'properties.patternGrid' },
  { value: 'hatch', labelKey: 'properties.patternHatch' },
  { value: 'cross-hatch', labelKey: 'properties.patternCrossHatch' },
  { value: 'checker', labelKey: 'properties.patternChecker' },
];

/** First solid-ish colour of a fill, for seeding type switches. */
function fillBaseColor(fill: Fill): string {
  if (fill.type === 'solid') return fill.color;
  if (fill.type === 'linear' || fill.type === 'radial') return fill.stops[0]?.color ?? '#007AFF';
  if (fill.type === 'pattern') return fill.color;
  return '#007AFF';
}

/** Construct a sensible default fill when switching the fill type. */
function fillForType(type: FillType, current: Fill): Fill {
  const base = fillBaseColor(current);
  if (type === 'solid') return { type: 'solid', color: base };
  if (type === 'linear') {
    return { type: 'linear', angle: 90, stops: [{ offset: 0, color: base }, { offset: 1, color: '#FFFFFF' }] };
  }
  if (type === 'radial') {
    return { type: 'radial', stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: base }] };
  }
  return { type: 'pattern', pattern: 'dots', color: base, background: '#FFFFFF', scale: 1, angle: 0 };
}

/** Full fill editor: type switch plus solid/gradient/pattern sub-controls. */
function FillField({ fill, onChange }: { fill: Fill; onChange: (fill: Fill) => void }) {
  const { t } = useTranslation('editor');
  const type: FillType = fill.type === 'image' ? 'solid' : fill.type;
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
        <span className="text-[var(--calqo-text-3)]">{t('properties.fill')}</span>
        <GlassSegmentedControl
          ariaLabel={t('properties.fill')}
          className="flex w-full [&>button]:flex-1 [&>button]:px-1"
          value={type}
          onChange={(next) => onChange(fillForType(next as FillType, fill))}
          options={FILL_TYPE_OPTIONS.map((value) => ({
            value,
            label: t(`properties.fill_${value}`),
          }))}
        />
      </div>
      {fill.type === 'solid' && (
        <ColorField
          label={t('properties.color')}
          value={fill.color}
          onChange={(color) => onChange({ type: 'solid', color })}
        />
      )}
      {(fill.type === 'linear' || fill.type === 'radial') && (
        <>
          <ColorField
            label={t('properties.gradientStart')}
            value={fill.stops[0]?.color ?? '#007AFF'}
            onChange={(color) =>
              onChange({ ...fill, stops: [{ offset: 0, color }, fill.stops[1] ?? { offset: 1, color: '#FFFFFF' }] })
            }
          />
          <ColorField
            label={t('properties.gradientEnd')}
            value={fill.stops[1]?.color ?? '#FFFFFF'}
            onChange={(color) =>
              onChange({ ...fill, stops: [fill.stops[0] ?? { offset: 0, color: '#007AFF' }, { offset: 1, color }] })
            }
          />
          {fill.type === 'linear' && (
            <NumberField
              label={t('properties.gradientAngle')}
              value={fill.angle ?? 0}
              onChange={(angle) => onChange({ ...fill, angle })}
            />
          )}
        </>
      )}
      {fill.type === 'pattern' && (
        <>
          <SelectField
            label={t('properties.pattern')}
            value={fill.pattern}
            options={PATTERN_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            onChange={(pattern) => onChange({ ...fill, pattern: pattern as typeof fill.pattern })}
          />
          <ColorField label={t('properties.color')} value={fill.color} onChange={(color) => onChange({ ...fill, color })} />
          <ColorField
            label={t('properties.background')}
            value={fill.background}
            onChange={(background) => onChange({ ...fill, background })}
          />
          <NumberField
            label={t('properties.patternScale')}
            value={fill.scale}
            min={0.25}
            max={6}
            onChange={(scale) => onChange({ ...fill, scale })}
          />
        </>
      )}
    </div>
  );
}

const STROKE_STYLE_OPTIONS: { value: NonNullable<StrokeStyle['style']>; labelKey: string }[] = [
  { value: 'solid', labelKey: 'properties.styleSolid' },
  { value: 'dashed', labelKey: 'properties.styleDashed' },
  { value: 'dotted', labelKey: 'properties.styleDotted' },
];

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
      <span className="text-[var(--calqo-text-3)]">{t('properties.strokeStyle')}</span>
      <GlassSegmentedControl
        ariaLabel={t('properties.strokeStyle')}
        className="flex w-full [&>button]:flex-1"
        value={value}
        onChange={(next) => onChange(next as NonNullable<StrokeStyle['style']>)}
        options={STROKE_STYLE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
      />
    </div>
  );
}

const DEFAULT_ARROW: ArrowStyle = { start: false, end: true, pointerLength: 16, pointerWidth: 16 };

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
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{t('properties.arrowHeads')}</span>
      <div className="flex gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-[var(--calqo-text-2)]">
          <input
            type="checkbox"
            checked={arrow.start}
            onChange={(event) => onChange({ ...arrow, start: event.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
          />
          {t('properties.arrowStart')}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[var(--calqo-text-2)]">
          <input
            type="checkbox"
            checked={arrow.end}
            onChange={(event) => onChange({ ...arrow, end: event.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
          />
          {t('properties.arrowEnd')}
        </label>
      </div>
    </div>
  );
}

function measureImage(file: File): Promise<{ width?: number; height?: number }> {
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
    return (
      <div className="flex flex-col gap-4">
        <IdentityCard
          icon={Layers}
          title={t('properties.selection')}
          subtitle={`${selected.length} ${t('properties.layers').toLowerCase()}`}
        />
      </div>
    );
  }

  return <ToolDefaults activeTool={activeTool} />;
}

/** Localized one-line descriptor under an object's name in the identity card. */
function layerSubtitle(
  t: ReturnType<typeof useTranslation>[0],
  layer: CalqoLayer,
): string {
  if (layer.type === 'shape') {
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
      <div className="flex flex-col gap-4">
        <Section title={t('properties.selection')}>
          <p className="px-2 py-1.5 text-[12px] text-[var(--calqo-text-3)]">
            {t('properties.noLayerSelected')}
          </p>
        </Section>
      </div>
    );
  }

  const isShapeTool = SHAPE_TOOLS.has(activeTool);
  const isPen = activeTool === 'pen';
  const isBrush = activeTool === 'brush';
  const hasFill = (isShapeTool && activeTool !== 'line' && activeTool !== 'arrow') || isPen;

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
          <NumberField
            label={t('properties.strokeWidth')}
            value={shapeDefaults.strokeWidth}
            min={0}
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
          <ColorField
            label={t('properties.stroke')}
            value={shapeDefaults.stroke}
            onChange={(stroke) => setShapeDefaults({ stroke })}
          />
          <NumberField
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
  const background =
    artboard.background.type === 'solid' ? artboard.background.color : '#ffffff';

  return (
    <>
      <Section title={t('properties.artboard')}>
        <Row label={t('properties.name')} value={artboard.name} />
        <Row label={t('properties.size')} value={`${artboard.width} x ${artboard.height}`} mono />
      </Section>
      <Section title={t('properties.background')}>
        <ColorField
          label={t('properties.color')}
          value={background}
          onChange={(color) =>
            editProject(
              projectId,
              (draft) => {
                const target = draft.artboards.find((candidate) => candidate.id === artboardId);
                if (target) target.background = { type: 'solid', color };
              },
              { undoable: true },
            )
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
      <Section title={layer.name}>
        <Row label={t('properties.type')} value={layer.type} mono />
        <NumberField label="X" value={layer.x} onChange={(x) => update({ x })} />
        <NumberField label="Y" value={layer.y} onChange={(y) => update({ y })} />
        <NumberField label="W" value={layer.w} min={1} onChange={(w) => update({ w })} />
        <NumberField label="H" value={layer.h} min={1} onChange={(h) => update({ h })} />
        <NumberField
          label={t('properties.rotate')}
          value={layer.rotation}
          onChange={(rotation) => update({ rotation })}
        />
        <NumberField
          label={t('properties.opacity')}
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          onChange={(opacity) => update({ opacity: opacity / 100 })}
        />
      </Section>

      {layer.type === 'shape' && (
        <Section title={t('properties.shape')}>
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
                if (kind === 'triangle' || kind === 'diamond' || kind === 'badge' || kind === 'star') {
                  update({
                    name: polygonDisplayName(kind),
                    shape: 'polygon',
                    points: polygonPoints(kind, layer.w, Math.max(1, Math.abs(layer.h))),
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
                  cornerRadius: kind === 'rect' ? (layer.cornerRadius ?? 18) : 0,
                });
              }}
            />
          )}
          {isFilledShape(layer) && (
            <FillField fill={layer.fill} onChange={(fill) => update({ fill })} />
          )}
          <ColorField
            label={t('properties.stroke')}
            value={layer.stroke?.color ?? '#007AFF'}
            onChange={(color) =>
              update({ stroke: { ...layer.stroke, color, width: layer.stroke?.width ?? 2 } })
            }
          />
          <NumberField
            label={t('properties.strokeWidth')}
            value={layer.stroke?.width ?? 0}
            min={0}
            onChange={(width) =>
              update({
                stroke:
                  width > 0
                    ? { ...layer.stroke, color: layer.stroke?.color ?? '#007AFF', width }
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
          {layer.shape === 'arrow' && (
            <ArrowHeadField
              value={layer.arrow}
              onChange={(arrow) => update({ arrow })}
            />
          )}
          {layer.shape === 'rect' && (
            <NumberField
              label={t('properties.cornerRadius')}
              value={layer.cornerRadius ?? 0}
              min={0}
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

      {layer.type === 'image' && (
        <Section title={t('properties.image')}>
          <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
            <span className="text-[var(--calqo-text-3)]">{t('properties.fit')}</span>
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
          <ReplaceAssetButton projectId={projectId} layer={layer} />
        </Section>
      )}

      {layer.type === 'svg' && (
        <Section title={t('properties.svg')}>
          <ReplaceAssetButton projectId={projectId} layer={layer} />
        </Section>
      )}
    </>
  );
}

const WEIGHT_OPTIONS = [
  { value: '300', label: '300' },
  { value: '400', label: '400' },
  { value: '500', label: '500' },
  { value: '600', label: '600' },
  { value: '700', label: '700' },
  { value: '800', label: '800' },
];

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

      <Section title={t('properties.typography')}>
        <SelectField
          label={t('properties.font')}
          value={layer.style.fontFamily}
          options={BUNDLED_FONTS.map((f) => ({ value: f.family, label: f.family }))}
          onChange={(fontFamily) => update({ style: { fontFamily } })}
        />
        <SelectField
          label={t('properties.weight')}
          value={String(layer.style.fontWeight)}
          options={WEIGHT_OPTIONS}
          onChange={(weight) => update({ style: { fontWeight: Number(weight) } })}
        />
        <NumberField
          label={t('properties.size')}
          value={layer.style.fontSize}
          min={1}
          onChange={(fontSize) => update({ style: { fontSize } })}
        />
        <AlignField
          value={layer.style.align}
          onChange={(align) => update({ style: { align } })}
        />
        <NumberField
          label={t('properties.lineHeight')}
          value={layer.style.lineHeight}
          min={0}
          onChange={(lineHeight) => update({ style: { lineHeight } })}
        />
        <NumberField
          label={t('properties.letterSpacing')}
          value={layer.style.letterSpacing}
          onChange={(letterSpacing) => update({ style: { letterSpacing } })}
        />
        <ColorField
          label={t('properties.color')}
          value={layer.style.color}
          onChange={(color) => update({ style: { color } })}
        />
      </Section>

      <Section title={t('properties.stroke')}>
        <ColorField
          label={t('properties.color')}
          value={layer.style.stroke?.color ?? '#000000'}
          onChange={(color) =>
            update({ style: { stroke: { color, width: layer.style.stroke?.width ?? 1 } } })
          }
        />
        <NumberField
          label={t('properties.strokeWidth')}
          value={layer.style.stroke?.width ?? 0}
          min={0}
          onChange={(width) =>
            update({
              style: {
                stroke:
                  width > 0
                    ? { color: layer.style.stroke?.color ?? '#000000', width }
                    : undefined,
              },
            })
          }
        />
      </Section>

      <Section title={t('properties.shadow')}>
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[12px] text-[var(--calqo-text-2)]">
          <input
            type="checkbox"
            checked={Boolean(shadow)}
            onChange={(event) =>
              update({ style: { shadow: event.target.checked ? DEFAULT_TEXT_SHADOW : undefined } })
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
              onChange={(color) => update({ style: { shadow: { ...shadow, color } } })}
            />
            <NumberField
              label={t('properties.blur')}
              value={shadow.blur}
              min={0}
              onChange={(blur) => update({ style: { shadow: { ...shadow, blur } } })}
            />
            <NumberField
              label="X"
              value={shadow.offsetX}
              onChange={(offsetX) => update({ style: { shadow: { ...shadow, offsetX } } })}
            />
            <NumberField
              label="Y"
              value={shadow.offsetY}
              onChange={(offsetY) => update({ style: { shadow: { ...shadow, offsetY } } })}
            />
            <NumberField
              label={t('properties.opacity')}
              value={Math.round((shadow.opacity ?? 1) * 100)}
              min={0}
              max={100}
              onChange={(opacity) =>
                update({ style: { shadow: { ...shadow, opacity: opacity / 100 } } })
              }
            />
          </>
        )}
      </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <span className="eyebrow">{title}</span>
      </div>
      <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <span className={`truncate text-[var(--calqo-text-2)] ${mono ? 'mono text-[11px]' : ''}`}>
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

const ALIGN_OPTIONS: { value: TextLayer['style']['align']; icon: LucideIcon }[] = [
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
      <span className="text-[var(--calqo-text-3)]">{t('properties.align')}</span>
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
