import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Arrow, Ellipse, Group, Image, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { Blur } from 'konva/lib/filters/Blur';
import type { CalqoLayer, ImageLayer } from '@/lib/schema';
import { fillProps, strokeProps } from './shapeStyle';
import { buildImageFilterPipeline, coverCropRect } from './imageFilters';
import { drawMaskPath } from './maskClip';
import { useAssetImage } from './useAssetImage';

export type NodeRegistry = Map<string, Konva.Node>;

interface LayerRendererProps {
  layer: CalqoLayer;
  activeLocale: string;
  selected: boolean;
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
) {
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
    draggable: !layer.locked,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true;
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
    selected,
    nodeRefs,
    onSelect,
    onDragMove,
    onDragEnd,
    onTransformEnd,
    onTextEdit,
    onImageCrop,
  } = props;

  useLayerBlur(nodeRefs, layer, activeLocale);

  if (!layer.visible) return null;

  if (layer.type === 'group') {
    const groupProps = commonProps(
      layer,
      nodeRefs,
      onSelect,
      onDragMove,
      onDragEnd,
      onTransformEnd,
    );
    return (
      <Group {...groupProps} {...blendProps(layer)}>
        {layer.children.map((child) => (
          <LayerRenderer
            key={child.id}
            {...props}
            layer={child}
            selected={selected || props.nodeRefs.current.has(child.id)}
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
  );

  if (layer.type === 'text') {
    return (
      <Text
        {...base}
        {...blendProps(layer)}
        text={layer.text[activeLocale] ?? Object.values(layer.text)[0] ?? ''}
        fontFamily={layer.style.fontFamily}
        fontSize={layer.style.fontSize}
        fontStyle={String(layer.style.fontWeight)}
        fill={layer.style.color}
        align={layer.style.align}
        verticalAlign={layer.style.verticalAlign}
        lineHeight={layer.style.lineHeight}
        letterSpacing={layer.style.letterSpacing}
        stroke={layer.style.stroke?.color}
        strokeWidth={layer.style.stroke?.width ?? 0}
        shadowColor={layer.style.shadow?.color}
        shadowBlur={layer.style.shadow?.blur}
        shadowOffsetX={layer.style.shadow?.offsetX}
        shadowOffsetY={layer.style.shadow?.offsetY}
        shadowOpacity={layer.style.shadow?.opacity}
        onDblClick={() => onTextEdit(layer)}
        onDblTap={() => onTextEdit(layer)}
      />
    );
  }

  if (layer.type === 'shape') {
    const stroke = strokeProps(layer.stroke);
    const effects = { ...shadowProps(layer), ...blendProps(layer) };
    const lineColor = layer.stroke?.color ?? '#111827';
    const lineWidth = layer.stroke?.width ?? 4;
    // Line-like shapes hit only along their thin stroke by default, which makes
    // them frustrating to grab and drag. Widen the invisible hit area.
    const lineHitWidth = Math.max(lineWidth, 18);

    if (layer.shape === 'ellipse') {
      return (
        <Ellipse
          {...base}
          {...effects}
          x={layer.x + layer.w / 2}
          y={layer.y + layer.h / 2}
          radiusX={layer.w / 2}
          radiusY={layer.h / 2}
          {...fillProps(layer.fill, layer.w, layer.h, true)}
          {...stroke}
        />
      );
    }
    if (layer.shape === 'arrow') {
      return (
        <Arrow
          {...base}
          {...effects}
          points={layer.points ?? [0, 0, layer.w, layer.h]}
          pointerAtBeginning={layer.arrow?.start ?? false}
          pointerAtEnding={layer.arrow?.end ?? true}
          pointerLength={layer.arrow?.pointerLength ?? 16}
          pointerWidth={layer.arrow?.pointerWidth ?? 16}
          fill={lineColor}
          stroke={lineColor}
          strokeWidth={lineWidth}
          hitStrokeWidth={lineHitWidth}
          dash={stroke.dash as number[] | undefined}
          lineCap="round"
          lineJoin="round"
        />
      );
    }
    if (layer.shape === 'freehand') {
      return (
        <Line
          {...base}
          {...effects}
          points={layer.points ?? [0, 0, layer.w, layer.h]}
          tension={layer.tension ?? 0.4}
          stroke={lineColor}
          strokeWidth={lineWidth}
          hitStrokeWidth={lineHitWidth}
          dash={stroke.dash as number[] | undefined}
          lineCap={layer.stroke?.cap ?? 'round'}
          lineJoin="round"
        />
      );
    }
    if (layer.shape === 'line' || layer.shape === 'polygon') {
      const isPolygon = layer.shape === 'polygon';
      return (
        <Line
          {...base}
          {...effects}
          points={layer.points ?? [0, 0, layer.w, layer.h]}
          closed={isPolygon}
          {...(isPolygon ? fillProps(layer.fill, layer.w, layer.h) : {})}
          stroke={lineColor}
          strokeWidth={lineWidth}
          hitStrokeWidth={isPolygon ? undefined : lineHitWidth}
          dash={stroke.dash as number[] | undefined}
          lineCap="round"
          lineJoin="round"
        />
      );
    }
    return (
      <Rect
        {...base}
        {...effects}
        {...fillProps(layer.fill, layer.w, layer.h)}
        {...stroke}
        cornerRadius={layer.cornerRadius ?? 0}
      />
    );
  }

  if (layer.type === 'image') {
    const imageBase = {
      ...base,
      onDblClick: () => onImageCrop?.(layer),
      onDblTap: () => onImageCrop?.(layer),
    };
    return <ImageLayerNode layer={layer} base={imageBase} />;
  }

  if (layer.type === 'svg') {
    return <SvgLayerNode layer={layer} base={base} />;
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
 * the cover/contain/stretch crop, focal point, and a cached filter pipeline. */
function ImageLayerNode({
  layer,
  base,
}: {
  layer: ImageLayer;
  base: ReturnType<typeof commonProps> & {
    onDblClick?: () => void;
    onDblTap?: () => void;
  };
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

  // Crop geometry inside the local box (the clip group is positioned at x/y).
  let imageProps: Konva.ImageConfig;
  if (layer.crop) {
    imageProps = {
      image,
      x: 0,
      y: 0,
      width: layer.w,
      height: layer.h,
      crop: { x: layer.crop.x, y: layer.crop.y, width: layer.crop.w, height: layer.crop.h },
    };
  } else if (layer.fit === 'cover') {
    imageProps = {
      image,
      x: 0,
      y: 0,
      width: layer.w,
      height: layer.h,
      crop: coverCropRect(image.width, image.height, layer.w, layer.h, layer.focalPoint),
    };
  } else if (layer.fit === 'contain') {
    const scale = Math.min(layer.w / image.width, layer.h / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    imageProps = {
      image,
      x: (layer.w - width) / 2,
      y: (layer.h - height) / 2,
      width,
      height,
    };
  } else {
    imageProps = { image, x: 0, y: 0, width: layer.w, height: layer.h };
  }

  const clipFunc = layer.mask
    ? (ctx: Konva.Context) =>
        drawMaskPath(ctx as unknown as CanvasRenderingContext2D, layer.mask!, layer.w, layer.h)
    : undefined;

  return (
    <Group {...base} {...shadowProps(layer)} {...blendProps(layer)} clipFunc={clipFunc}>
      <Image ref={imageRef} {...imageProps} />
    </Group>
  );
}

/** SVG layer: a rasterised asset Image with optional shadow / blend mode. */
function SvgLayerNode({
  layer,
  base,
}: {
  layer: Extract<CalqoLayer, { type: 'svg' }>;
  base: ReturnType<typeof commonProps>;
}) {
  const { image, missing } = useAssetImage(layer.assetId, layer.color);
  if (!image) return <AssetPlaceholder layer={layer} base={base} missing={missing} />;
  return <Image {...base} {...shadowProps(layer)} {...blendProps(layer)} image={image} />;
}
