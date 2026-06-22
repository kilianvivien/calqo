import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Layer, Line, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  addLayerToActiveArtboard,
  createFreehandLayer,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import type { CalqoArtboard, CalqoLayer, CalqoProject } from '@/lib/schema';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import { LayerRenderer, type NodeRegistry } from '@/editor/canvas/LayerRenderer';
import { ArtboardBackground } from '@/editor/canvas/ArtboardBackground';
import { computeSnap, SNAP_DISTANCE } from '@/editor/canvas/snapping';
import { findLayerInArtboard, flattenLayers } from '@/editor/utils/layers';

interface MobileStageProps {
  project: CalqoProject;
  artboard: CalqoArtboard;
  /** Open the text quick-edit sheet (double-tap on a text/list layer). */
  onEditText: (layer: CalqoLayer) => void;
  /** Open the crop & reframe editor (double-tap on an image). */
  onCropImage: (layer: CalqoLayer) => void;
  /** When true, one-finger drags paint a freehand stroke instead of selecting. */
  brush?: boolean;
}

interface Size {
  width: number;
  height: number;
}

/** The pan/zoom transform applied to the content layer (stage coords). */
interface View {
  scale: number;
  x: number;
  y: number;
}

const PADDING = 16;
/** Compact visual transform anchors for the scaled-down phone canvas. */
const TOUCH_ANCHOR = 9;
const TOUCH_ANCHOR_RADIUS = 2;
const TOUCH_ANCHOR_STROKE = 1.2;
const TOUCH_ROTATE_OFFSET = 22;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 8;

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Bake a dragged/transformed Konva node's geometry back into the schema.
 * Mirrors the desktop stage's `normalizeNode` so phone and desktop edits commit
 * identically (groups scale children, ellipses are centre-origin, polygons keep
 * their point list proportional). */
function commitNode(projectId: string, layer: CalqoLayer, node: Konva.Node): void {
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  const width = Math.max(1, layer.w * scaleX);
  const height = Math.max(1, layer.h * scaleY);
  node.scale({ x: 1, y: 1 });

  if (layer.type === 'group') {
    updateLayerInActiveArtboard(projectId, layer.id, {
      x: node.x(),
      y: node.y(),
      w: width,
      h: height,
      rotation: node.rotation(),
      groupScale: { sx: scaleX, sy: scaleY },
    });
    return;
  }
  if (layer.type === 'shape' && layer.shape === 'ellipse') {
    updateLayerInActiveArtboard(projectId, layer.id, {
      x: node.x() - width / 2,
      y: node.y() - height / 2,
      w: width,
      h: height,
      rotation: node.rotation(),
    });
    return;
  }
  if (layer.type === 'shape' && layer.points) {
    updateLayerInActiveArtboard(projectId, layer.id, {
      x: node.x(),
      y: node.y(),
      w: width,
      h: height,
      rotation: node.rotation(),
      points: layer.points.map((value, i) => value * (i % 2 === 0 ? scaleX : scaleY)),
    });
    return;
  }
  updateLayerInActiveArtboard(projectId, layer.id, {
    x: node.x(),
    y: node.y(),
    w: width,
    h: height,
    rotation: node.rotation(),
  });
}

/** Touch-first single-artboard canvas. Reuses the desktop {@link LayerRenderer}
 * but provides finger-sized transform handles, two-finger pinch-zoom / pan
 * (the canvas is the only zoomable surface — page zoom is suppressed), and
 * lazily mounts only the active artboard (PRD §5.9). */
export function MobileStage({
  project,
  artboard,
  onEditText,
  onCropImage,
  brush = false,
}: MobileStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<NodeRegistry>(new Map());
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [pinching, setPinching] = useState(false);
  const [draft, setDraft] = useState<number[] | null>(null);
  const drawing = useRef(false);
  const draftRef = useRef<number[] | null>(null);
  draftRef.current = draft;

  const selectedLayerIds = useSelectionStore((s) => s.selectedLayerIds);
  const selectOne = useSelectionStore((s) => s.selectOne);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const guides = useUiStore((s) => s.guides);
  const setGuides = useUiStore((s) => s.setGuides);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset to a fresh fit when switching artboards.
  useEffect(() => setView(null), [artboard.id]);

  const fitScale =
    size.width > 0 && size.height > 0
      ? Math.min(
          (size.width - PADDING * 2) / artboard.width,
          (size.height - PADDING * 2) / artboard.height,
        )
      : 0;
  const fit: View = {
    scale: fitScale,
    x: (size.width - artboard.width * fitScale) / 2,
    y: (size.height - artboard.height * fitScale) / 2,
  };
  const current = view ?? fit;

  // Keep the live view in a ref so the imperative gesture handlers always read
  // the latest transform without re-subscribing.
  const viewRef = useRef(current);
  viewRef.current = current;
  const fitRef = useRef(fit);
  fitRef.current = fit;

  // Two-finger pinch-zoom + pan. One finger is left to Konva for selecting and
  // dragging objects, so the gestures never fight. Bound natively so we can
  // preventDefault (React touch listeners are passive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let gesture: { dist: number; cx: number; cy: number; view: View } | null = null;

    const localCenter = (a: Touch, b: Touch) => {
      const rect = el.getBoundingClientRect();
      return {
        x: (a.clientX + b.clientX) / 2 - rect.left,
        y: (a.clientY + b.clientY) / 2 - rect.top,
      };
    };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const [a, b] = [event.touches[0], event.touches[1]];
      const c = localCenter(a, b);
      gesture = { dist: touchDistance(a, b), cx: c.x, cy: c.y, view: viewRef.current };
      // A second finger turns a brush stroke into a pinch — drop the draft.
      drawing.current = false;
      setDraft(null);
      // Drop any snap guide from a one-finger drag the pinch interrupts.
      useUiStore.getState().setGuides([]);
      setPinching(true);
      event.preventDefault();
    };

    const onMove = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 2) return;
      event.preventDefault();
      const [a, b] = [event.touches[0], event.touches[1]];
      const ratio = touchDistance(a, b) / gesture.dist;
      const min = fitRef.current.scale * MIN_ZOOM_FACTOR;
      const max = fitRef.current.scale * MAX_ZOOM_FACTOR;
      const scale = Math.max(min, Math.min(max, gesture.view.scale * ratio));
      // Anchor the zoom on the world point under the pinch midpoint, and pan
      // with the midpoint so two-finger drag also moves the canvas.
      const worldX = (gesture.cx - gesture.view.x) / gesture.view.scale;
      const worldY = (gesture.cy - gesture.view.y) / gesture.view.scale;
      const c = localCenter(a, b);
      setView({ scale, x: c.x - worldX * scale, y: c.y - worldY * scale });
    };

    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        gesture = null;
        setPinching(false);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Keep the transformer attached to the current selection.
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = selectedLayerIds
      .map((id) => nodeRefs.current.get(id))
      .filter((node): node is Konva.Node => Boolean(node));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedLayerIds, artboard, current.scale]);

  const handleStageTap = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (event.target === event.target.getStage()) {
      // A second tap on empty canvas snaps back to the fitted view.
      if (event.type === 'dbltap') setView(null);
      else clearSelection();
    }
  };

  const toArtboard = (stage: Konva.Stage) => {
    const pos = stage.getPointerPosition();
    const v = viewRef.current;
    if (!pos) return null;
    return { x: (pos.x - v.x) / v.scale, y: (pos.y - v.y) / v.scale };
  };

  const onPointerDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!brush) {
      handleStageTap(event);
      return;
    }
    const evt = event.evt;
    if ('touches' in evt && evt.touches.length > 1) return; // pinch, not draw
    const stage = event.target.getStage();
    const p = stage && toArtboard(stage);
    if (!p) return;
    drawing.current = true;
    setDraft([p.x, p.y]);
  };

  const onPointerMove = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!brush || !drawing.current) return;
    const stage = event.target.getStage();
    const p = stage && toArtboard(stage);
    if (!p) return;
    setDraft((prev) => (prev ? [...prev, p.x, p.y] : [p.x, p.y]));
  };

  const finishStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const points = draftRef.current;
    setDraft(null);
    if (points && points.length >= 4) {
      const layer = createFreehandLayer(points, useUiStore.getState().shapeDefaults);
      if (layer) addLayerToActiveArtboard(project.id, layer);
    }
  };

  // Smart snapping while dragging: snap the moving node to other layers and the
  // artboard, drawing guide lines — same engine as the desktop stage. Runs in
  // artboard coordinates (via getClientRect), so the view transform is irrelevant.
  const snapNode = (layer: CalqoLayer, node: Konva.Node) => {
    if (!snapEnabled) return;
    const rect = node.getClientRect({ relativeTo: node.getParent() ?? undefined });
    const others = flattenLayers(artboard.layers)
      .filter((candidate) => candidate.id !== layer.id && candidate.visible)
      .map((candidate) => ({
        x: candidate.x,
        y: candidate.y,
        width: candidate.w,
        height: candidate.h,
      }));
    const { dx, dy, guides: nextGuides } = computeSnap(
      { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      others,
      { width: artboard.width, height: artboard.height },
      SNAP_DISTANCE,
    );
    if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
    setGuides(nextGuides);
  };

  const brushDefaults = useUiStore((s) => s.shapeDefaults);
  const scale = current.scale;

  // Lines/arrows have a near-flat bounding box, so the default transformer
  // (which rejects boxes under 12px and sits its handles on top of the stroke)
  // makes them nearly ungrabbable on touch. Pad the box, push the rotate handle
  // out, and stop rejecting thin boxes — mirrors the desktop stage.
  const onlySelected =
    selectedLayerIds.length === 1
      ? findLayerInArtboard(artboard, selectedLayerIds[0])
      : null;
  const lineLike =
    onlySelected?.type === 'shape' &&
    (onlySelected.shape === 'line' || onlySelected.shape === 'arrow');

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {scale > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          onMouseDown={onPointerDown}
          onTouchStart={onPointerDown}
          onMouseMove={onPointerMove}
          onTouchMove={onPointerMove}
          onMouseUp={finishStroke}
          onTouchEnd={finishStroke}
          onDblTap={handleStageTap}
        >
          <Layer
            x={current.x}
            y={current.y}
            scaleX={scale}
            scaleY={scale}
            clipX={0}
            clipY={0}
            clipWidth={artboard.width}
            clipHeight={artboard.height}
            listening={!pinching && !brush}
          >
            <ArtboardBackground
              background={artboard.background}
              width={artboard.width}
              height={artboard.height}
            />
            {artboard.layers.map((layer) => (
              <LayerRenderer
                key={layer.id}
                layer={layer}
                activeLocale={project.activeContentLocale}
                selected={selectedLayerIds.includes(layer.id)}
                nodeRefs={nodeRefs}
                onSelect={(target) => selectOne(target.id)}
                onDragMove={snapNode}
                onDragEnd={(target, node) => {
                  commitNode(project.id, target, node);
                  setGuides([]);
                }}
                onTransformEnd={(target, node) => commitNode(project.id, target, node)}
                onTextEdit={(target) => {
                  if (
                    (target.type === 'text' || target.type === 'list') &&
                    !target.locked
                  ) {
                    selectOne(target.id);
                    onEditText(target);
                  }
                }}
                onImageCrop={(target) => {
                  if (target.type === 'image' && !target.locked) {
                    selectOne(target.id);
                    onCropImage(target);
                  }
                }}
              />
            ))}
            <Transformer
              ref={transformerRef}
              rotateEnabled
              ignoreStroke
              useSingleNodeRotation
              padding={lineLike ? 18 / scale : 0}
              rotateAnchorOffset={(lineLike ? 34 : TOUCH_ROTATE_OFFSET) / scale}
              anchorSize={(lineLike ? 11 : TOUCH_ANCHOR) / scale}
              anchorCornerRadius={TOUCH_ANCHOR_RADIUS / scale}
              anchorStrokeWidth={TOUCH_ANCHOR_STROKE / scale}
              anchorStroke="#007AFF"
              anchorFill="#FFFFFF"
              borderStroke="#007AFF"
              borderStrokeWidth={1.5 / scale}
              boundBoxFunc={(oldBox, next) =>
                // Lines/arrows are legitimately thin — never reject their box or
                // both resize and rotate get blocked. Other shapes keep a floor.
                !lineLike && (next.width < 12 || next.height < 12) ? oldBox : next
              }
            />
            {draft && draft.length >= 2 && (
              <Line
                points={draft}
                stroke={brushDefaults.stroke}
                strokeWidth={brushDefaults.brushSize}
                lineCap="round"
                lineJoin="round"
                tension={0.4}
                listening={false}
              />
            )}
            {guides.map((guide) => (
              <Line
                key={`${guide.axis}-${guide.position}`}
                points={
                  guide.axis === 'x'
                    ? [guide.position, 0, guide.position, artboard.height]
                    : [0, guide.position, artboard.width, guide.position]
                }
                stroke="#007AFF"
                strokeWidth={1 / scale}
                dash={[8 / scale, 5 / scale]}
                listening={false}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
