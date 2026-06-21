import { Group, Image, Rect } from 'react-konva';
import type Konva from 'konva';
import type { BackgroundFill, Fill } from '@/lib/schema';
import { fillProps } from './shapeStyle';
import { fitImageConfig } from './imageFilters';
import { useAssetImage } from './useAssetImage';

interface ArtboardBackgroundProps {
  background: BackgroundFill;
  /** Box in the parent's coordinate space. */
  x?: number;
  y?: number;
  width: number;
  height: number;
  /** Extra props (shadow / stroke) painted on the base rect — e.g. the desktop
   * stage's paper drop shadow. */
  frameProps?: Konva.ShapeConfig;
}

/** Renders an artboard background for every {@link BackgroundFill} case: solid
 * and gradient fills go on the base rect (so any frame shadow/stroke applies),
 * while an image fill is drawn as a clipped, fitted Image on top. Shared by the
 * desktop and mobile stages so backgrounds render identically. */
export function ArtboardBackground({
  background,
  x = 0,
  y = 0,
  width,
  height,
  frameProps,
}: ArtboardBackgroundProps) {
  const assetId = background.type === 'image' ? background.assetId : null;
  const { image } = useAssetImage(assetId);

  const baseFill: Konva.ShapeConfig =
    background.type === 'image'
      ? { fill: '#FFFFFF' }
      : fillProps(background as Fill, width, height);

  const imageConfig =
    background.type === 'image' && image
      ? fitImageConfig(image, background.fit, width, height)
      : null;

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        {...frameProps}
        {...baseFill}
        listening={false}
      />
      {imageConfig && (
        <Group
          x={x}
          y={y}
          clipX={0}
          clipY={0}
          clipWidth={width}
          clipHeight={height}
          listening={false}
        >
          <Image {...imageConfig} />
        </Group>
      )}
    </>
  );
}
