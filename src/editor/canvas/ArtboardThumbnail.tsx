import { useRef } from 'react';
import { Layer, Stage } from 'react-konva';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { ArtboardBackground } from './ArtboardBackground';
import { LayerRenderer, type NodeRegistry } from './LayerRenderer';

interface ArtboardThumbnailProps {
  project: CalqoProject;
  artboard: CalqoArtboard;
  /** Box the preview must fit within (CSS pixels). */
  maxWidth: number;
  maxHeight: number;
}

const noop = () => {};

/** Static, non-interactive miniature of an artboard — its background plus every
 * layer rendered through the shared {@link LayerRenderer} so the preview matches
 * the live canvas exactly. Scaled to fit the given box; pointer events are left
 * to the surrounding tile (this Stage doesn't listen). Used by the artboard
 * overview grid. */
export function ArtboardThumbnail({
  project,
  artboard,
  maxWidth,
  maxHeight,
}: ArtboardThumbnailProps) {
  // Local registry so LayerRenderer's node-ref callbacks have somewhere to go;
  // nothing reads it back for a static preview.
  const nodeRefs = useRef<NodeRegistry>(new Map());

  const scale = Math.min(
    maxWidth / artboard.width,
    maxHeight / artboard.height,
  );
  const width = Math.max(1, Math.round(artboard.width * scale));
  const height = Math.max(1, Math.round(artboard.height * scale));

  return (
    <Stage
      width={width}
      height={height}
      listening={false}
      style={{ pointerEvents: 'none' }}
    >
      <Layer listening={false}>
        <ArtboardBackground
          background={artboard.background}
          width={width}
          height={height}
        />
      </Layer>
      <Layer
        scaleX={scale}
        scaleY={scale}
        listening={false}
        clipX={0}
        clipY={0}
        clipWidth={artboard.width}
        clipHeight={artboard.height}
      >
        {artboard.layers.map((layer) => (
          <LayerRenderer
            key={layer.id}
            layer={layer}
            activeLocale={project.activeContentLocale}
            selected={false}
            interactive={false}
            nodeRefs={nodeRefs}
            onSelect={noop}
            onDragMove={noop}
            onDragEnd={noop}
            onTransformEnd={noop}
            onTextEdit={noop}
          />
        ))}
      </Layer>
    </Stage>
  );
}
