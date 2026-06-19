import { useTranslation } from 'react-i18next';
import { Arrow, Ellipse, Group, Image, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { CalqoLayer } from '@/lib/schema';
import { fillProps, strokeProps } from './shapeStyle';
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
  } = props;

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
      <Group {...groupProps}>
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
    const lineColor = layer.stroke?.color ?? '#111827';
    const lineWidth = layer.stroke?.width ?? 4;
    // Line-like shapes hit only along their thin stroke by default, which makes
    // them frustrating to grab and drag. Widen the invisible hit area.
    const lineHitWidth = Math.max(lineWidth, 18);

    if (layer.shape === 'ellipse') {
      return (
        <Ellipse
          {...base}
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
          points={layer.points ?? [0, 0, layer.w, layer.h]}
          tension={layer.tension ?? 0.4}
          stroke={lineColor}
          strokeWidth={lineWidth}
          hitStrokeWidth={lineHitWidth}
          dash={stroke.dash as number[] | undefined}
          lineCap="round"
          lineJoin="round"
        />
      );
    }
    if (layer.shape === 'line' || layer.shape === 'polygon') {
      const isPolygon = layer.shape === 'polygon';
      return (
        <Line
          {...base}
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
        {...fillProps(layer.fill, layer.w, layer.h)}
        {...stroke}
        cornerRadius={layer.cornerRadius ?? 0}
      />
    );
  }

  if (layer.type === 'image' || layer.type === 'svg') {
    return <AssetLayer layer={layer} base={base} />;
  }

  return null;
}

function AssetLayer({
  layer,
  base,
}: {
  layer: Extract<CalqoLayer, { type: 'image' | 'svg' }>;
  base: ReturnType<typeof commonProps>;
}) {
  const { t } = useTranslation('editor');
  const { image, missing } = useAssetImage(layer.assetId);
  if (image) {
    if (layer.type === 'image' && layer.fit === 'cover') {
      const imageRatio = image.width / image.height;
      const layerRatio = layer.w / layer.h;
      const cropByWidth = imageRatio > layerRatio;
      const cropWidth = cropByWidth ? image.height * layerRatio : image.width;
      const cropHeight = cropByWidth ? image.height : image.width / layerRatio;
      return (
        <Image
          {...base}
          image={image}
          crop={{
            x: (image.width - cropWidth) / 2,
            y: (image.height - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight,
          }}
        />
      );
    }
    if (layer.type === 'image' && layer.fit === 'contain') {
      const scale = Math.min(layer.w / image.width, layer.h / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      return (
        <Image
          {...base}
          image={image}
          x={layer.x + (layer.w - width) / 2}
          y={layer.y + (layer.h - height) / 2}
          width={width}
          height={height}
        />
      );
    }
    return <Image {...base} image={image} />;
  }
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
