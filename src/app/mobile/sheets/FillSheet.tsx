import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ImagePlus } from 'lucide-react';
import {
  setArtboardBackground,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import type {
  BackgroundFill,
  CalqoArtboard,
  CalqoLayer,
  CalqoProject,
  Fill,
  StrokeStyle,
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
import { BottomSheet } from '@/components/mobile';
import { cn } from '@/lib/utils/cn';

interface FillSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
  artboard: CalqoArtboard;
  layer: CalqoLayer | null;
}

/** Any shape layer gets stroke controls; only filled shapes get the fill editor. */
function isShapeLayer(layer: CalqoLayer | null): layer is Extract<CalqoLayer, { type: 'shape' }> {
  return layer?.type === 'shape';
}

/** Shapes with an interior fill take the full fill editor; line/arrow/freehand
 * are stroke-only and skip it. */
function isShapeFill(layer: CalqoLayer | null): layer is Extract<CalqoLayer, { type: 'shape' }> {
  return (
    layer?.type === 'shape' &&
    layer.shape !== 'line' &&
    layer.shape !== 'arrow' &&
    layer.shape !== 'freehand'
  );
}

function isFlatRecolorable(layer: CalqoLayer | null): boolean {
  return layer?.type === 'text' || layer?.type === 'list' || layer?.type === 'svg';
}

function flatColor(layer: CalqoLayer): string | undefined {
  if (layer.type === 'text' || layer.type === 'list') return layer.style.color;
  if (layer.type === 'svg') return layer.color;
  return undefined;
}

function Swatch({
  color,
  active,
  onClick,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={color}
      className={cn(
        'relative h-11 w-11 shrink-0 rounded-full border transition-transform active:scale-95',
        active
          ? 'border-[var(--calqo-accent)] ring-2 ring-[var(--calqo-accent-ring)]'
          : 'border-[var(--calqo-divider)]',
      )}
      style={{ background: color }}
    >
      {active && (
        <Check size={16} className="absolute inset-0 m-auto text-white mix-blend-difference" />
      )}
    </button>
  );
}

function ColorRow({
  label,
  value,
  palette,
  onPick,
}: {
  label: string;
  value: string | undefined;
  palette: string[];
  onPick: (color: string) => void;
}) {
  const { t } = useTranslation('editor');
  const swatches = [...new Set([...palette, '#000000', '#FFFFFF'])];
  return (
    <section className="py-2">
      <p className="mb-2 text-[12px] font-medium text-[var(--calqo-text-2)]">{label}</p>
      <div className="calqo-scroll flex items-center gap-2 overflow-x-auto pb-1">
        <label
          className="relative grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--calqo-divider)] text-[10px] font-medium text-[var(--calqo-text-3)]"
          style={{ background: value ?? 'transparent' }}
        >
          {!value && t('mobile.color.custom')}
          <input
            type="color"
            value={value ?? '#000000'}
            onChange={(event) => onPick(event.target.value)}
            className="absolute h-0 w-0 opacity-0"
          />
        </label>
        {swatches.map((color) => (
          <Swatch
            key={color}
            color={color}
            active={value?.toLowerCase() === color.toLowerCase()}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </section>
  );
}

/** Horizontal pill selector used for fill types, patterns, and fit modes. */
function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <section className="py-2">
      {label && (
        <p className="mb-2 text-[12px] font-medium text-[var(--calqo-text-2)]">{label}</p>
      )}
      <div className="calqo-scroll flex items-center gap-1.5 overflow-x-auto pb-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors active:scale-[0.97]',
              option.value === value
                ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
                : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Slider({
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
  return (
    <label className="block py-2">
      <span className="mb-1 block text-[12px] font-medium text-[var(--calqo-text-2)]">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--calqo-accent)]"
      />
    </label>
  );
}

/** Full fill editor for the selected shape (solid / gradient / pattern / image). */
function ShapeFillControls({
  projectId,
  layer,
  palette,
  inputRef,
}: {
  projectId: string;
  layer: Extract<CalqoLayer, { type: 'shape' }>;
  palette: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation('editor');
  const fill = layer.fill;
  const set = (next: Fill) => updateLayerInActiveArtboard(projectId, layer.id, { fill: next });

  return (
    <>
      <Chips<FillType>
        label={t('properties.fill')}
        value={fill.type}
        options={FILL_TYPE_OPTIONS.map((value) => ({
          value,
          label: t(`properties.fill_${value}`),
        }))}
        onChange={(next) => {
          if (next === 'image') {
            if (fill.type !== 'image') inputRef.current?.click();
            return;
          }
          set(fillForType(next, fill));
        }}
      />

      {fill.type === 'solid' && (
        <ColorRow
          label={t('properties.color')}
          value={fill.color}
          palette={palette}
          onPick={(color) => set({ type: 'solid', color })}
        />
      )}

      {(fill.type === 'linear' || fill.type === 'radial') && (
        <>
          <ColorRow
            label={t('properties.gradientStart')}
            value={fill.stops[0]?.color}
            palette={palette}
            onPick={(color) =>
              set({ ...fill, stops: [{ offset: 0, color }, fill.stops[1] ?? { offset: 1, color: '#FFFFFF' }] })
            }
          />
          <ColorRow
            label={t('properties.gradientEnd')}
            value={fill.stops[1]?.color}
            palette={palette}
            onPick={(color) =>
              set({ ...fill, stops: [fill.stops[0] ?? { offset: 0, color: '#007AFF' }, { offset: 1, color }] })
            }
          />
          {fill.type === 'linear' && (
            <Slider
              label={t('properties.gradientAngle')}
              value={fill.angle ?? 0}
              min={0}
              max={360}
              onChange={(angle) => set({ ...fill, angle })}
            />
          )}
        </>
      )}

      {fill.type === 'pattern' && (
        <>
          <Chips
            label={t('properties.pattern')}
            value={fill.pattern}
            options={PATTERN_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            onChange={(pattern) => set({ ...fill, pattern })}
          />
          <ColorRow
            label={t('properties.color')}
            value={fill.color}
            palette={palette}
            onPick={(color) => set({ ...fill, color })}
          />
          <ColorRow
            label={t('properties.background')}
            value={fill.background}
            palette={palette}
            onPick={(background) => set({ ...fill, background })}
          />
          <Slider
            label={t('properties.patternScale')}
            value={fill.scale}
            min={0.25}
            max={6}
            step={0.25}
            onChange={(scale) => set({ ...fill, scale })}
          />
        </>
      )}

      {fill.type === 'image' && (
        <>
          <Chips
            label={t('properties.fit')}
            value={fill.fit}
            options={[
              { value: 'cover' as const, label: t('properties.cover') },
              { value: 'contain' as const, label: t('properties.contain') },
              { value: 'stretch' as const, label: t('properties.stretch') },
            ]}
            onChange={(fit) => set({ ...fill, fit })}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[13px] font-medium text-[var(--calqo-text-2)] transition-colors active:bg-[var(--calqo-hover)]"
          >
            <ImagePlus size={16} />
            {t('properties.replaceAsset')}
          </button>
        </>
      )}
    </>
  );
}

/** Stroke editor for any shape. Line/arrow/freehand treat the stroke as their
 * only colour and weight (the "thickness" of a line); filled shapes treat it as
 * an optional border that can be removed by sliding the width to 0. */
function ShapeStrokeControls({
  projectId,
  layer,
  palette,
}: {
  projectId: string;
  layer: Extract<CalqoLayer, { type: 'shape' }>;
  palette: string[];
}) {
  const { t } = useTranslation('editor');
  const stroke = layer.stroke;
  const strokeOnly =
    layer.shape === 'line' || layer.shape === 'arrow' || layer.shape === 'freehand';
  const update = (patch: Parameters<typeof updateLayerInActiveArtboard>[2]) =>
    updateLayerInActiveArtboard(projectId, layer.id, patch);

  const setColor = (color: string) =>
    update({ stroke: { ...stroke, color, width: stroke?.width ?? 2 } });

  const setWidth = (width: number) => {
    if (strokeOnly) {
      // A line/freehand stroke is the element itself — never let it vanish.
      update({
        stroke: { ...stroke, color: stroke?.color ?? '#007AFF', width: Math.max(1, width) },
      });
      return;
    }
    update({
      stroke:
        width > 0
          ? { ...stroke, color: stroke?.color ?? '#007AFF', width }
          : undefined,
    });
  };

  const setStyle = (style: NonNullable<StrokeStyle['style']>) =>
    update({
      stroke: { ...stroke, color: stroke?.color ?? '#007AFF', width: stroke?.width ?? 2, style },
    });

  return (
    <>
      <ColorRow
        label={strokeOnly ? t('properties.color') : t('properties.stroke')}
        value={stroke?.color}
        palette={palette}
        onPick={setColor}
      />
      <Slider
        label={t('properties.strokeWidth')}
        value={stroke?.width ?? 0}
        min={strokeOnly ? 1 : 0}
        max={40}
        step={0.5}
        onChange={setWidth}
      />
      {(stroke?.width ?? 0) > 0 && (
        <Chips
          label={t('properties.strokeStyle')}
          value={stroke?.style ?? 'solid'}
          options={[
            { value: 'solid' as const, label: t('properties.styleSolid') },
            { value: 'dashed' as const, label: t('properties.styleDashed') },
            { value: 'dotted' as const, label: t('properties.styleDotted') },
          ]}
          onChange={setStyle}
        />
      )}
    </>
  );
}

/** Background editor (solid / gradient / image). */
function BackgroundFillControls({
  projectId,
  artboard,
  palette,
  inputRef,
}: {
  projectId: string;
  artboard: CalqoArtboard;
  palette: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation('editor');
  const bg = artboard.background;
  const set = (next: BackgroundFill) => setArtboardBackground(projectId, artboard.id, next);

  return (
    <>
      <Chips<BackgroundFillType>
        label={t('mobile.color.background')}
        value={bg.type === 'image' ? 'image' : bg.type}
        options={BACKGROUND_FILL_TYPE_OPTIONS.map((value) => ({
          value,
          label: t(`properties.fill_${value}`),
        }))}
        onChange={(next) => {
          if (next === 'image') {
            if (bg.type !== 'image') inputRef.current?.click();
            return;
          }
          set(backgroundFillForType(next, bg));
        }}
      />

      {bg.type === 'solid' && (
        <ColorRow
          label={t('properties.color')}
          value={bg.color}
          palette={palette}
          onPick={(color) => set({ type: 'solid', color })}
        />
      )}

      {(bg.type === 'linear' || bg.type === 'radial') && (
        <>
          <ColorRow
            label={t('properties.gradientStart')}
            value={bg.stops[0]?.color}
            palette={palette}
            onPick={(color) =>
              set({ ...bg, stops: [{ offset: 0, color }, bg.stops[1] ?? { offset: 1, color: '#FFFFFF' }] })
            }
          />
          <ColorRow
            label={t('properties.gradientEnd')}
            value={bg.stops[1]?.color}
            palette={palette}
            onPick={(color) =>
              set({ ...bg, stops: [bg.stops[0] ?? { offset: 0, color: '#007AFF' }, { offset: 1, color }] })
            }
          />
          {bg.type === 'linear' && (
            <Slider
              label={t('properties.gradientAngle')}
              value={bg.angle ?? 0}
              min={0}
              max={360}
              onChange={(angle) => set({ ...bg, angle })}
            />
          )}
        </>
      )}

      {bg.type === 'image' && (
        <>
          <Chips
            label={t('properties.fit')}
            value={bg.fit}
            options={[
              { value: 'cover' as const, label: t('properties.cover') },
              { value: 'contain' as const, label: t('properties.contain') },
              { value: 'stretch' as const, label: t('properties.stretch') },
            ]}
            onChange={(fit) => set({ ...bg, fit })}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[13px] font-medium text-[var(--calqo-text-2)] transition-colors active:bg-[var(--calqo-hover)]"
          >
            <ImagePlus size={16} />
            {t('properties.replaceAsset')}
          </button>
        </>
      )}
    </>
  );
}

/** Phone fill editor: the selected element's fill (shapes get the full
 * solid/gradient/pattern/image editor; text/list/svg get a flat recolour) plus
 * the artboard background, seeded from the project palette. */
export function FillSheet({ open, onClose, project, artboard, layer }: FillSheetProps) {
  const { t } = useTranslation('editor');
  const shapeImageInput = useRef<HTMLInputElement>(null);
  const bgImageInput = useRef<HTMLInputElement>(null);
  const shapeLayer = isShapeLayer(layer);
  const shape = isShapeFill(layer);
  const flat = isFlatRecolorable(layer);

  const onPickShapeImage = (file: File | undefined) => {
    if (!file || !shape || !layer) return;
    void saveImageAsset(project.id, file).then((asset) =>
      updateLayerInActiveArtboard(project.id, layer.id, {
        fill: { type: 'image', assetId: asset.id, fit: 'cover' },
      }),
    );
  };

  const onPickBgImage = (file: File | undefined) => {
    if (!file) return;
    void saveImageAsset(project.id, file).then((asset) =>
      setArtboardBackground(project.id, artboard.id, { type: 'image', assetId: asset.id, fit: 'cover' }, asset),
    );
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.color.title')}
      bodyClassName="pb-4"
    >
      {shape && layer && (
        <ShapeFillControls
          projectId={project.id}
          layer={layer}
          palette={project.palette}
          inputRef={shapeImageInput}
        />
      )}
      {shapeLayer && layer && (
        <ShapeStrokeControls
          projectId={project.id}
          layer={layer}
          palette={project.palette}
        />
      )}
      {flat && layer && (
        <ColorRow
          label={t('mobile.color.element')}
          value={flatColor(layer)}
          palette={project.palette}
          onPick={(color) => {
            if (layer.type === 'text' || layer.type === 'list') {
              updateLayerInActiveArtboard(project.id, layer.id, { style: { color } });
            } else if (layer.type === 'svg') {
              updateLayerInActiveArtboard(project.id, layer.id, { color });
            }
          }}
        />
      )}

      <BackgroundFillControls
        projectId={project.id}
        artboard={artboard}
        palette={project.palette}
        inputRef={bgImageInput}
      />

      <input
        ref={shapeImageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          onPickShapeImage(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={bgImageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          onPickBgImage(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
    </BottomSheet>
  );
}
