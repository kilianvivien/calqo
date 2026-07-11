import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Arrow, Circle, Ellipse, Group, Image, Line, Path, Rect, Text } from 'react-konva';
import { CalqoText } from './CalqoText';
import type Konva from 'konva';
import { Blur } from 'konva/lib/filters/Blur';
import type { ArrowStyle, CalqoLayer, ImageLayer, ListLayer } from '@/lib/schema';
import { listRowLayout, markerGlyph } from '@/editor/i18n-content/translationPipeline';
import { fillProps, imageFillProps } from './shapeStyle';
import { strokeLookConfig } from './strokeStyle';
import { pressureOutlinePoints } from './freehandGeometry';
import { stickerStrokeConfig } from './stickerOutline';
import { frameRender, type FrameNodeSpec } from './frameNodes';
import { buildImageFilterPipeline, coverCropRect } from './imageFilters';
import { drawMaskPath } from './maskClip';
import { useAssetImage } from './useAssetImage';

export type NodeRegistry = Map<string, Konva.Node>;

interface LayerRendererProps {
  layer: CalqoLayer;
  activeLocale: string;
  selected: boolean;
  interactive?: boolean;
  nodeRefs: React.MutableRefObject<NodeRegistry>;
  onSelect: (layer: CalqoLayer, additive: boolean) => void;
  onDragMove: (layer: CalqoLayer, node: Konva.Node) => void;
  onDragEnd: (layer: CalqoLayer, node: Konva.Node) => void;
  onTransformEnd: (layer: CalqoLayer, node: Konva.Node) => void;
  onTextEdit: (layer: CalqoLayer) => void;
  onImageCrop?: (layer: CalqoLayer) => void;
}

function commonProps(
  layer: CalqoLayer,
  nodeRefs: React.MutableRefObject<NodeRegistry>,
  onSelect: (layer: CalqoLayer, additive: boolean) => void,
  onDragMove: (layer: CalqoLayer, node: Konva.Node) => void,
  onDragEnd: (layer: CalqoLayer, node: Konva.Node) => void,
  onTransformEnd: (layer: CalqoLayer, node: Konva.Node) => void,
  interactive = true,
) {
  const handlers = interactive
    ? {
        onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
          event.cancelBubble = true;
          if (event.evt.button !== 0) return;
          onSelect(layer, event.evt.shiftKey);
        },
        onTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
          event.cancelBubble = true;
          onSelect(layer, false);
        },
        onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => {
          onDragMove(layer, event.target);
        },
        onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
          onDragEnd(layer, event.target);
        },
        onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
          onTransformEnd(layer, event.target);
        },
      }
    : {};

  return {
    ref: (node: Konva.Node | null) => {
      if (node) nodeRefs.current.set(layer.id, node);
      else nodeRefs.current.delete(layer.id);
    },
    id: layer.id,
    name: layer.id,
    x: layer.x,
    y: layer.y,
    width: layer.w,
    height: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: interactive && !layer.locked,
    ...handlers,
  };
}

/** Konva drop-shadow props for a schema layer effect. */
function shadowProps(layer: CalqoLayer): Konva.ShapeConfig {
  const shadow = layer.effects?.shadow;
  if (!shadow) return {};
  return {
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
    shadowOpacity: shadow.opacity ?? 1,
  };
}

/** Blend-mode prop (canvas composite op); `normal` is the implicit default. */
function blendProps(layer: CalqoLayer): Konva.ShapeConfig {
  if (!layer.blendMode || layer.blendMode === 'normal') return {};
  return { globalCompositeOperation: layer.blendMode };
}

/** Size-only props for a node placed inside its own transform group (decorated
 * layers): the group carries x/y/rotation/opacity, the child sits at the local
 * origin. */
function localSizeProps(layer: CalqoLayer): Konva.ShapeConfig {
  return { x: 0, y: 0, width: layer.w, height: layer.h, listening: false };
}

function LocalHitRect({
  layer,
  interactive,
  onSelect,
}: {
  layer: CalqoLayer;
  interactive: boolean;
  onSelect: (layer: CalqoLayer, additive: boolean) => void;
}) {
  if (!interactive || layer.locked) return null;
  const outset =
    layer.type !== 'list' && layer.type !== 'group' && layer.sticker
      ? layer.sticker.width
      : 0;
  return (
    <Rect
      x={-outset}
      y={-outset}
      width={layer.w + outset * 2}
      height={layer.h + outset * 2}
      fill="transparent"
      onClick={(event) => {
        event.cancelBubble = true;
        if (event.evt.button !== 0) return;
        onSelect(layer, event.evt.shiftKey);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect(layer, false);
      }}
    />
  );
}

function arrowTip(
  points: number[],
  atStart: boolean,
): { x: number; y: number; radians: number } | null {
  if (points.length < 4) return null;
  if (atStart) {
    return {
      x: points[0],
      y: points[1],
      radians: Math.atan2(points[1] - points[3], points[0] - points[2]),
    };
  }
  const n = points.length;
  return {
    x: points[n - 2],
    y: points[n - 1],
    radians: Math.atan2(points[n - 1] - points[n - 3], points[n - 2] - points[n - 4]),
  };
}

function arrowHeadNodes({
  points,
  arrow,
  color,
  width,
  keyPrefix,
}: {
  points: number[];
  arrow: ArrowStyle | undefined;
  color: string;
  width: number;
  keyPrefix: string;
}) {
  const style = arrow?.headStyle ?? 'triangle';
  const length = arrow?.pointerLength ?? 16;
  const headWidth = arrow?.pointerWidth ?? 16;
  const heads: ReactNode[] = [];
  const addHead = (atStart: boolean) => {
    const tip = arrowTip(points, atStart);
    if (!tip) return;
    const cos = Math.cos(tip.radians);
    const sin = Math.sin(tip.radians);
    const point = (forward: number, side: number) => ({
      x: tip.x + forward * cos - side * sin,
      y: tip.y + forward * sin + side * cos,
    });
    const key = `${keyPrefix}-${atStart ? 'start' : 'end'}`;
    if (style === 'chevron') {
      const a = point(-length, headWidth / 2);
      const b = point(-length, -headWidth / 2);
      heads.push(
        <Line
          key={key}
          points={[a.x, a.y, tip.x, tip.y, b.x, b.y]}
          stroke={color}
          strokeWidth={width}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />,
      );
      return;
    }
    if (style === 'bar') {
      const a = point(0, headWidth / 2);
      const b = point(0, -headWidth / 2);
      heads.push(
        <Line
          key={key}
          points={[a.x, a.y, b.x, b.y]}
          stroke={color}
          strokeWidth={Math.max(width, 2)}
          lineCap="round"
          listening={false}
        />,
      );
      return;
    }
    if (style === 'dot') {
      heads.push(
        <Circle
          key={key}
          x={tip.x}
          y={tip.y}
          radius={Math.max(headWidth / 2, width)}
          fill={color}
          listening={false}
        />,
      );
    }
  };
  if (arrow?.start ?? false) addHead(true);
  if (arrow?.end ?? true) addHead(false);
  return heads;
}

/** Render a list of declarative frame node specs (shared shape between the live
 * renderer and the raster export). */
function FrameNodesView({ nodes }: { nodes: FrameNodeSpec[] }) {
  return (
    <>
      {nodes.map((spec, i) => {
        const shadow = 'shadow' in spec && spec.shadow ? {
          shadowColor: spec.shadow.color,
          shadowBlur: spec.shadow.blur,
          shadowOffsetX: spec.shadow.offsetX,
          shadowOffsetY: spec.shadow.offsetY,
          shadowOpacity: spec.shadow.opacity ?? 1,
        } : {};
        if (spec.kind === 'rect') {
          return (
            <Rect
              key={i}
              x={spec.x}
              y={spec.y}
              width={spec.w}
              height={spec.h}
              fill={spec.fill}
              stroke={spec.stroke}
              strokeWidth={spec.strokeWidth}
              cornerRadius={spec.cornerRadius}
              dash={spec.dash}
              dashEnabled={spec.dash != null}
              lineCap={spec.dash ? 'round' : undefined}
              rotation={spec.rotation}
              opacity={spec.opacity}
              listening={false}
              {...shadow}
            />
          );
        }
        if (spec.kind === 'path') {
          return (
            <Path
              key={i}
              data={spec.data}
              fill={spec.fill}
              stroke={spec.stroke}
              strokeWidth={spec.strokeWidth}
              opacity={spec.opacity}
              listening={false}
              {...shadow}
            />
          );
        }
        if (spec.kind === 'ellipse') {
          return (
            <Ellipse
              key={i}
              x={spec.x + spec.w / 2}
              y={spec.y + spec.h / 2}
              radiusX={spec.w / 2}
              radiusY={spec.h / 2}
              stroke={spec.stroke}
              strokeWidth={spec.strokeWidth}
              listening={false}
              {...shadow}
            />
          );
        }
        return (
          <Text
            key={i}
            x={spec.x}
            y={spec.y}
            width={spec.w}
            height={spec.h}
            text={spec.text}
            fill={spec.color}
            fontSize={spec.fontSize}
            fontFamily="Inter"
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        );
      })}
    </>
  );
}

/** Apply / clear a cached Blur filter on a node so schema-backed `effects.blur`
 * renders on the live canvas. Images manage their own filter pipeline. */
function useLayerBlur(
  nodeRefs: React.MutableRefObject<NodeRegistry>,
  layer: CalqoLayer,
  activeLocale: string,
) {
  useEffect(() => {
    const node = nodeRefs.current.get(layer.id);
    if (!node || layer.type === 'image') return;
    const blur = layer.effects?.blur ?? 0;
    try {
      if (blur > 0) {
        node.setAttr('blurRadius', blur);
        node.filters([Blur]);
        node.cache();
      } else {
        node.filters([]);
        node.clearCache();
      }
      node.getLayer()?.batchDraw();
    } catch {
      /* no canvas (jsdom) — skip caching */
    }
    // Re-cache whenever the layer or its rendered text changes.
  }, [nodeRefs, layer, activeLocale]);
}

export function LayerRenderer(props: LayerRendererProps) {
  const {
    layer,
    activeLocale,
    interactive = true,
    nodeRefs,
    onSelect,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    onTextEdit,
    onImageCrop,
  } = props;

  useLayerBlur(nodeRefs, layer, activeLocale);

  // Image fills load their asset asynchronously; resolve it here so the hook is
  // always called in the same order regardless of layer type.
  const shapeFill = layer.type === 'shape' ? layer.fill : null;
  const fillImageAssetId = shapeFill?.type === 'image' ? shapeFill.assetId : null;
  const { image: fillImage } = useAssetImage(fillImageAssetId);
  const resolveFillProps = (w: number, h: number, centered = false) => {
    if (!shapeFill) return {};
    if (shapeFill.type === 'image') {
      return fillImage
        ? imageFillProps(fillImage, shapeFill.fit, w, h, centered)
        : { fill: '#FFFFFF' };
    }
    return fillProps(shapeFill, w, h, centered);
  };

  if (!layer.visible) return null;

  if (layer.type === 'group') {
    const groupProps = commonProps(
      layer,
      nodeRefs,
      onSelect,
      onDragMove,
      onDragEnd,
      onTransformEnd,
      interactive,
    );
    return (
      <Group {...groupProps} {...blendProps(layer)}>
        {layer.children.map((child) => (
          <LayerRenderer
            key={child.id}
            {...props}
            layer={child}
            selected={false}
            interactive={false}
          />
        ))}
      </Group>
    );
  }

  const base = commonProps(
    layer,
    nodeRefs,
    onSelect,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    interactive,
  );

  if (layer.type === 'text') {
    const textValue = layer.text[activeLocale] ?? Object.values(layer.text)[0] ?? '';
    const typeProps = {
      text: textValue,
      fontFamily: layer.style.fontFamily,
      fontSize: layer.style.fontSize,
      fontStyle: layer.style.fontStyle,
      textDecoration: layer.style.textDecoration,
      align: layer.style.align,
      verticalAlign: layer.style.verticalAlign,
      lineHeight: layer.style.lineHeight,
      letterSpacing: layer.style.letterSpacing,
    };
    const ownStroke = {
      stroke: layer.style.stroke?.color,
      strokeWidth: layer.style.stroke?.width ?? 0,
    };
    const shadow = {
      shadowColor: layer.style.shadow?.color,
      shadowBlur: layer.style.shadow?.blur,
      shadowOffsetX: layer.style.shadow?.offsetX,
      shadowOffsetY: layer.style.shadow?.offsetY,
      shadowOpacity: layer.style.shadow?.opacity,
    };
    const editHandlers = {
      onDblClick: interactive ? () => onTextEdit(layer) : undefined,
      onDblTap: interactive ? () => onTextEdit(layer) : undefined,
    };

    if (!layer.sticker) {
      return (
        <CalqoText
          {...base}
          {...blendProps(layer)}
          {...typeProps}
          fill={layer.style.color}
          {...ownStroke}
          {...shadow}
          {...editHandlers}
          fontWeight={layer.style.fontWeight}
        />
      );
    }

    // Sticker outline: a fat-stroked duplicate behind the glyphs, then the
    // primary text on top, both inside the layer's transform group.
    const stickerCfg = stickerStrokeConfig(layer.sticker);
    return (
      <Group {...base} {...blendProps(layer)} {...editHandlers}>
        <LocalHitRect layer={layer} interactive={interactive} onSelect={onSelect} />
        <CalqoText
          {...localSizeProps(layer)}
          {...typeProps}
          fill={layer.sticker.color}
          {...stickerCfg}
          fontWeight={layer.style.fontWeight}
        />
        <CalqoText
          {...localSizeProps(layer)}
          {...typeProps}
          fill={layer.style.color}
          {...ownStroke}
          {...shadow}
          fontWeight={layer.style.fontWeight}
        />
      </Group>
    );
  }

  if (layer.type === 'shape') {
    const strokeCfg = strokeLookConfig(layer.stroke);
    const effects = { ...shadowProps(layer), ...blendProps(layer) };
    const lineColor = layer.stroke?.color ?? '#111827';
    const lineWidth = layer.stroke?.width ?? 4;
    // Line-like shapes hit only along their thin stroke by default, which makes
    // them frustrating to grab and drag. Widen the invisible hit area.
    const lineHitWidth = Math.max(lineWidth, 18);
    const points = layer.points ?? [0, 0, layer.w, layer.h];

    /** Render the shape body. `geom` positions it (top-left = layer.x/y for the
     * standalone node, or 0/0 when nested in a decoration group). `paint` is the
     * normal fill+stroke or the sticker halo pass. */
    const shapeBody = (
      key: string,
      nodeProps: ReturnType<typeof commonProps> | Konva.ShapeConfig,
      tlx: number,
      tly: number,
      paint: { fill?: Konva.ShapeConfig; stroke: Konva.ShapeConfig; fx: Konva.ShapeConfig },
    ) => {
      const common = { ...nodeProps, ...paint.fx };
      const cap = (paint.stroke.lineCap as 'butt' | 'round' | 'square' | undefined) ?? layer.stroke?.cap ?? 'round';
      const join = (paint.stroke.lineJoin as 'miter' | 'round' | 'bevel' | undefined) ?? layer.stroke?.join ?? 'round';
      if (layer.shape === 'ellipse') {
        return (
          <Ellipse
            key={key}
            {...common}
            x={tlx + layer.w / 2}
            y={tly + layer.h / 2}
            radiusX={layer.w / 2}
            radiusY={layer.h / 2}
            {...(paint.fill ?? {})}
            {...paint.stroke}
          />
        );
      }
      if (layer.shape === 'arrow') {
        const arrowStyle = layer.arrow?.headStyle ?? 'triangle';
        if (arrowStyle !== 'triangle') {
          return (
            <Group key={key} {...common}>
              <Line
                points={points}
                stroke={(paint.stroke.stroke as string) ?? lineColor}
                strokeWidth={(paint.stroke.strokeWidth as number) ?? lineWidth}
                hitStrokeWidth={lineHitWidth}
                dash={paint.stroke.dash as number[] | undefined}
                lineCap={cap}
                lineJoin={join}
                shadowColor={paint.stroke.shadowColor as string | undefined}
                shadowBlur={paint.stroke.shadowBlur as number | undefined}
                shadowOffsetX={paint.stroke.shadowOffsetX as number | undefined}
                shadowOffsetY={paint.stroke.shadowOffsetY as number | undefined}
                shadowOpacity={paint.stroke.shadowOpacity as number | undefined}
                shadowForStrokeEnabled={paint.stroke.shadowForStrokeEnabled as boolean | undefined}
              />
              {arrowHeadNodes({
                points,
                arrow: layer.arrow,
                color: (paint.stroke.stroke as string) ?? lineColor,
                width: (paint.stroke.strokeWidth as number) ?? lineWidth,
                keyPrefix: key,
              })}
            </Group>
          );
        }
        return (
          <Arrow
            key={key}
            {...common}
            points={points}
            pointerAtBeginning={layer.arrow?.start ?? false}
            pointerAtEnding={layer.arrow?.end ?? true}
            pointerLength={layer.arrow?.pointerLength ?? 16}
            pointerWidth={layer.arrow?.pointerWidth ?? 16}
            fill={(paint.stroke.stroke as string) ?? lineColor}
            stroke={(paint.stroke.stroke as string) ?? lineColor}
            strokeWidth={(paint.stroke.strokeWidth as number) ?? lineWidth}
            hitStrokeWidth={lineHitWidth}
            dash={paint.stroke.dash as number[] | undefined}
            lineCap={cap}
            lineJoin={join}
            shadowColor={paint.stroke.shadowColor as string | undefined}
            shadowBlur={paint.stroke.shadowBlur as number | undefined}
            shadowOffsetX={paint.stroke.shadowOffsetX as number | undefined}
            shadowOffsetY={paint.stroke.shadowOffsetY as number | undefined}
            shadowOpacity={paint.stroke.shadowOpacity as number | undefined}
            shadowForStrokeEnabled={paint.stroke.shadowForStrokeEnabled as boolean | undefined}
          />
        );
      }
      if (layer.shape === 'freehand') {
        // Pressure-sensitive stroke: fill the variable-width ribbon outline
        // (a constant-width Konva stroke cannot vary along the path).
        const ribbon =
          layer.pointWidths && layer.pointWidths.length >= 2 && points.length >= 4
            ? pressureOutlinePoints(points, layer.pointWidths)
            : null;
        if (ribbon && ribbon.length >= 6) {
          return (
            <Line
              key={key}
              {...common}
              points={ribbon}
              closed
              fill={(paint.stroke.stroke as string) ?? lineColor}
              lineJoin="round"
              shadowColor={paint.stroke.shadowColor as string | undefined}
              shadowBlur={paint.stroke.shadowBlur as number | undefined}
              shadowOffsetX={paint.stroke.shadowOffsetX as number | undefined}
              shadowOffsetY={paint.stroke.shadowOffsetY as number | undefined}
              shadowOpacity={paint.stroke.shadowOpacity as number | undefined}
            />
          );
        }
        return (
          <Line
            key={key}
            {...common}
            points={points}
            tension={layer.tension ?? 0.4}
            stroke={(paint.stroke.stroke as string) ?? lineColor}
            strokeWidth={(paint.stroke.strokeWidth as number) ?? lineWidth}
            hitStrokeWidth={lineHitWidth}
            dash={paint.stroke.dash as number[] | undefined}
            lineCap={cap}
            lineJoin={join}
            shadowColor={paint.stroke.shadowColor as string | undefined}
            shadowBlur={paint.stroke.shadowBlur as number | undefined}
            shadowOffsetX={paint.stroke.shadowOffsetX as number | undefined}
            shadowOffsetY={paint.stroke.shadowOffsetY as number | undefined}
            shadowOpacity={paint.stroke.shadowOpacity as number | undefined}
            shadowForStrokeEnabled={paint.stroke.shadowForStrokeEnabled as boolean | undefined}
          />
        );
      }
      if (layer.shape === 'line' || layer.shape === 'polygon') {
        const isPolygon = layer.shape === 'polygon';
        return (
          <Line
            key={key}
            {...common}
            points={points}
            closed={isPolygon}
            {...(isPolygon ? (paint.fill ?? {}) : {})}
            stroke={(paint.stroke.stroke as string) ?? lineColor}
            strokeWidth={(paint.stroke.strokeWidth as number) ?? lineWidth}
            hitStrokeWidth={isPolygon ? undefined : lineHitWidth}
            dash={paint.stroke.dash as number[] | undefined}
            lineCap={cap}
            lineJoin={join}
            shadowColor={paint.stroke.shadowColor as string | undefined}
            shadowBlur={paint.stroke.shadowBlur as number | undefined}
            shadowOffsetX={paint.stroke.shadowOffsetX as number | undefined}
            shadowOffsetY={paint.stroke.shadowOffsetY as number | undefined}
            shadowOpacity={paint.stroke.shadowOpacity as number | undefined}
            shadowForStrokeEnabled={paint.stroke.shadowForStrokeEnabled as boolean | undefined}
          />
        );
      }
      return (
        <Rect
          key={key}
          {...common}
          {...(paint.fill ?? {})}
          {...paint.stroke}
          cornerRadius={layer.cornerRadius ?? 0}
        />
      );
    };

    const primaryPaint = {
      fill: resolveFillProps(layer.w, layer.h, layer.shape === 'ellipse'),
      stroke: strokeCfg,
      fx: effects,
    };

    if (!layer.sticker) {
      return shapeBody('p', base, layer.x, layer.y, primaryPaint);
    }

    // Sticker outline: a fat-stroked silhouette behind the shape, then the
    // shape on top — both nested in the layer's transform group.
    const stickerCfg = stickerStrokeConfig(layer.sticker, lineWidth);
    return (
      <Group {...base} {...blendProps(layer)} {...shadowProps(layer)}>
        <LocalHitRect layer={layer} interactive={interactive} onSelect={onSelect} />
        {shapeBody('s', localSizeProps(layer), 0, 0, {
          fill: { fill: layer.sticker.color },
          stroke: stickerCfg,
          fx: {},
        })}
        {shapeBody('p', localSizeProps(layer), 0, 0, {
          fill: primaryPaint.fill,
          stroke: strokeCfg,
          fx: {},
        })}
      </Group>
    );
  }

  if (layer.type === 'image') {
    const imageBase = {
      ...base,
      onDblClick: interactive ? () => onImageCrop?.(layer) : undefined,
      onDblTap: interactive ? () => onImageCrop?.(layer) : undefined,
    };
    return (
      <ImageLayerNode
        layer={layer}
        base={imageBase}
        activeLocale={activeLocale}
        interactive={interactive}
        onSelect={onSelect}
      />
    );
  }

  if (layer.type === 'svg') {
    return (
      <SvgLayerNode
        layer={layer}
        base={base}
        interactive={interactive}
        onSelect={onSelect}
      />
    );
  }

  if (layer.type === 'list') {
    return (
      <ListLayerNode
        layer={layer}
        base={base}
        activeLocale={activeLocale}
        onTextEdit={onTextEdit}
        interactive={interactive}
      />
    );
  }

  return null;
}

function AssetPlaceholder({
  layer,
  base,
  missing,
}: {
  layer: Extract<CalqoLayer, { type: 'image' | 'svg' }>;
  base: ReturnType<typeof commonProps>;
  missing: boolean;
}) {
  const { t } = useTranslation('editor');
  return (
    <Group {...base}>
      <Rect
        width={layer.w}
        height={layer.h}
        fill={missing ? '#FFECEC' : '#F2F5F9'}
        stroke={missing ? '#FF5F57' : '#94A3B8'}
        dash={[8, 6]}
        cornerRadius={12}
      />
      <Text
        width={layer.w}
        height={layer.h}
        align="center"
        verticalAlign="middle"
        fill={missing ? '#B42318' : '#64748B'}
        fontSize={18}
        fontFamily="Inter"
        text={missing ? t('canvas.missingAsset') : t('canvas.loadingAsset')}
      />
    </Group>
  );
}

/** Image layer: a clip group (for masks) wrapping a single Image that carries
 * the cover/contain/stretch crop, focal point, and a cached filter pipeline.
 * An optional decorative frame insets the image content and draws around it; an
 * optional sticker halo sits behind the whole layer. */
function ImageLayerNode({
  layer,
  base,
  activeLocale,
  interactive,
  onSelect,
}: {
  layer: ImageLayer;
  base: ReturnType<typeof commonProps> & {
    onDblClick?: () => void;
    onDblTap?: () => void;
  };
  activeLocale: string;
  interactive: boolean;
  onSelect: (layer: CalqoLayer, additive: boolean) => void;
}) {
  const { image, missing } = useAssetImage(layer.assetId);
  const imageRef = useRef<Konva.Image>(null);
  const pipeline = buildImageFilterPipeline(layer.filters);

  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    try {
      if (pipeline.filters.length > 0) {
        node.setAttr('brightness', pipeline.attrs.brightness);
        node.setAttr('contrast', pipeline.attrs.contrast);
        node.setAttr('saturation', pipeline.attrs.saturation);
        node.setAttr('blurRadius', pipeline.attrs.blurRadius);
        node.filters(pipeline.filters);
        node.cache();
      } else {
        node.filters([]);
        node.clearCache();
      }
      node.getLayer()?.batchDraw();
    } catch {
      /* no canvas (jsdom) — skip caching */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, layer]);

  if (!image) return <AssetPlaceholder layer={layer} base={base} missing={missing} />;

  // A frame insets the image content; without one the content fills the box.
  const caption = layer.frame?.caption?.[activeLocale] ?? Object.values(layer.frame?.caption ?? {})[0] ?? '';
  const frame = layer.frame ? frameRender(layer.frame, layer.w, layer.h, caption) : null;
  const inset = frame?.inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const cw = Math.max(1, layer.w - inset.left - inset.right);
  const ch = Math.max(1, layer.h - inset.top - inset.bottom);

  // Crop geometry inside the (possibly inset) content box.
  let imageProps: Konva.ImageConfig;
  if (layer.crop) {
    imageProps = {
      image,
      x: 0,
      y: 0,
      width: cw,
      height: ch,
      crop: { x: layer.crop.x, y: layer.crop.y, width: layer.crop.w, height: layer.crop.h },
    };
  } else if (layer.fit === 'cover') {
    imageProps = {
      image,
      x: 0,
      y: 0,
      width: cw,
      height: ch,
      crop: coverCropRect(image.width, image.height, cw, ch, layer.focalPoint),
    };
  } else if (layer.fit === 'contain') {
    const scale = Math.min(cw / image.width, ch / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    imageProps = {
      image,
      x: (cw - width) / 2,
      y: (ch - height) / 2,
      width,
      height,
    };
  } else {
    imageProps = { image, x: 0, y: 0, width: cw, height: ch };
  }

  const clipFunc = layer.mask
    ? (ctx: Konva.Context) =>
        drawMaskPath(ctx as unknown as CanvasRenderingContext2D, layer.mask!, cw, ch)
    : undefined;

  // Sticker halo behind the whole layer (approximated as a rounded silhouette).
  const stickerNode = layer.sticker ? (
    <Rect
      x={-layer.sticker.width}
      y={-layer.sticker.width}
      width={layer.w + layer.sticker.width * 2}
      height={layer.h + layer.sticker.width * 2}
      fill={layer.sticker.color}
      cornerRadius={layer.sticker.width}
      listening={false}
      {...(layer.sticker.shadow
        ? {
            shadowColor: layer.sticker.shadow.color,
            shadowBlur: layer.sticker.shadow.blur,
            shadowOffsetX: layer.sticker.shadow.offsetX,
            shadowOffsetY: layer.sticker.shadow.offsetY,
            shadowOpacity: layer.sticker.shadow.opacity ?? 1,
          }
        : {})}
    />
  ) : null;

  // No frame and no sticker: keep the original single-clip-group fast path.
  if (!frame && !stickerNode) {
    return (
      <Group {...base} {...shadowProps(layer)} {...blendProps(layer)} clipFunc={clipFunc}>
        <Image ref={imageRef} {...imageProps} />
      </Group>
    );
  }

  return (
    <Group {...base} {...shadowProps(layer)} {...blendProps(layer)}>
      <LocalHitRect layer={layer} interactive={interactive} onSelect={onSelect} />
      {stickerNode}
      {frame ? <FrameNodesView nodes={frame.behind} /> : null}
      <Group
        x={inset.left}
        y={inset.top}
        clipFunc={clipFunc}
        listening={false}
      >
        <Image ref={imageRef} {...imageProps} />
      </Group>
      {frame ? <FrameNodesView nodes={frame.front} /> : null}
    </Group>
  );
}

/** SVG layer: a rasterised asset Image with optional shadow / blend mode. */
function SvgLayerNode({
  layer,
  base,
  interactive,
  onSelect,
}: {
  layer: Extract<CalqoLayer, { type: 'svg' }>;
  base: ReturnType<typeof commonProps>;
  interactive: boolean;
  onSelect: (layer: CalqoLayer, additive: boolean) => void;
}) {
  const { image, missing } = useAssetImage(layer.assetId, layer.color);
  if (!image) return <AssetPlaceholder layer={layer} base={base} missing={missing} />;
  if (layer.sticker) {
    return (
      <Group {...base} {...blendProps(layer)}>
        <LocalHitRect layer={layer} interactive={interactive} onSelect={onSelect} />
        <Rect
          x={-layer.sticker.width}
          y={-layer.sticker.width}
          width={layer.w + layer.sticker.width * 2}
          height={layer.h + layer.sticker.width * 2}
          fill={layer.sticker.color}
          cornerRadius={layer.sticker.width}
          listening={false}
        />
        <Image {...localSizeProps(layer)} {...shadowProps(layer)} image={image} />
      </Group>
    );
  }
  return <Image {...base} {...shadowProps(layer)} {...blendProps(layer)} image={image} />;
}

/** List layer: a clipped group stacking one marker + one wrapped text node per
 * row. Row heights come from the shared offscreen measurement so on-canvas
 * layout matches overflow detection. */
function ListLayerNode({
  layer,
  base,
  activeLocale,
  onTextEdit,
  interactive = true,
}: {
  layer: ListLayer;
  base: ReturnType<typeof commonProps>;
  activeLocale: string;
  onTextEdit: (layer: CalqoLayer) => void;
  interactive?: boolean;
}) {
  const { rowHeights, totalHeight, markerWidth, rowTextWidth } = useMemo(
    () => listRowLayout(layer, activeLocale),
    [layer, activeLocale],
  );

  // Vertically anchor the stacked rows within the box per the shared style.
  const vAlign = layer.style.verticalAlign ?? 'top';
  let startY = 0;
  if (vAlign === 'middle') startY = Math.max(0, (layer.h - totalHeight) / 2);
  else if (vAlign === 'bottom') startY = Math.max(0, layer.h - totalHeight);

  const markerSize = layer.marker.size ?? layer.style.fontSize;
  const markerIsAsset = layer.marker.kind === 'asset';
  const { image: markerImage, missing: markerMissing } = useAssetImage(
    markerIsAsset ? (layer.marker.assetId ?? null) : null,
    markerIsAsset ? layer.marker.color : undefined,
  );

  let cursorY = startY;
  return (
    <Group
      {...base}
      {...shadowProps(layer)}
      {...blendProps(layer)}
      clipX={0}
      clipY={0}
      clipWidth={layer.w}
      clipHeight={layer.h}
      onDblClick={interactive ? () => onTextEdit(layer) : undefined}
      onDblTap={interactive ? () => onTextEdit(layer) : undefined}
    >
      {layer.items.map((row, index) => {
        const rowHeight = rowHeights[index] ?? layer.style.fontSize * layer.style.lineHeight;
        const value = row.text[activeLocale] ?? Object.values(row.text)[0] ?? '';
        const rowY = cursorY;
        cursorY += rowHeight;
        return (
          <Group key={row.id}>
            {layer.marker.kind !== 'none' && (
              <>
                {markerIsAsset ? (
                  markerImage ? (
                    <Image
                      image={markerImage}
                      x={0}
                      y={rowY + Math.max(0, (layer.style.fontSize * layer.style.lineHeight - markerSize) / 2)}
                      width={markerSize}
                      height={markerSize}
                    />
                  ) : (
                    <Rect
                      x={0}
                      y={rowY}
                      width={markerSize}
                      height={markerSize}
                      fill={markerMissing ? '#FFECEC' : '#F2F5F9'}
                      stroke={markerMissing ? '#FF5F57' : '#94A3B8'}
                      dash={[4, 3]}
                    />
                  )
                ) : (
                  <CalqoText
                    x={0}
                    y={rowY}
                    width={markerWidth}
                    height={rowHeight}
                    text={markerGlyph(layer.marker)}
                    fontFamily={layer.style.fontFamily}
                    fontSize={markerSize}
                    fontStyle={layer.style.fontStyle}
                    textDecoration={layer.style.textDecoration}
                    fontWeight={layer.style.fontWeight}
                    fill={layer.marker.color}
                    align="left"
                    verticalAlign="top"
                    lineHeight={layer.style.lineHeight}
                    wrap="none"
                  />
                )}
              </>
            )}
            <CalqoText
              x={markerWidth + layer.markerGap}
              y={rowY}
              width={rowTextWidth}
              height={rowHeight}
              text={value}
              fontFamily={layer.style.fontFamily}
              fontSize={layer.style.fontSize}
              fontStyle={layer.style.fontStyle}
              textDecoration={layer.style.textDecoration}
              fontWeight={layer.style.fontWeight}
              fill={layer.style.color}
              align={layer.style.align}
              verticalAlign="top"
              lineHeight={layer.style.lineHeight}
              letterSpacing={layer.style.letterSpacing}
              stroke={layer.style.stroke?.color}
              strokeWidth={layer.style.stroke?.width ?? 0}
              shadowColor={layer.style.shadow?.color}
              shadowBlur={layer.style.shadow?.blur}
              shadowOffsetX={layer.style.shadow?.offsetX}
              shadowOffsetY={layer.style.shadow?.offsetY}
              shadowOpacity={layer.style.shadow?.opacity}
            />
          </Group>
        );
      })}
    </Group>
  );
}
