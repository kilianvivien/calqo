import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { assetStorage } from '@/lib/adapters';
import {
  addImportedAssetLayer,
  addLayerToActiveArtboard,
  createShapeLayer,
  createTextLayer,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard, flattenLayers } from '@/editor/utils/layers';
import type { CalqoArtboard, CalqoLayer, CalqoProject, TextLayer } from '@/lib/schema';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import { TextEditOverlay } from './TextEditOverlay';
import { LayerRenderer, type NodeRegistry } from './LayerRenderer';

interface CalqoStageProps {
  project: CalqoProject;
  artboard: CalqoArtboard;
}

interface StageSize {
  width: number;
  height: number;
}

type DraftShape = {
  shape: 'rect' | 'ellipse' | 'line';
  start: { x: number; y: number };
  current: { x: number; y: number };
};

const SNAP_DISTANCE = 6;

function backgroundColor(artboard: CalqoArtboard): string {
  return artboard.background.type === 'solid' ? artboard.background.color : '#FFFFFF';
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

function fitZoom(size: StageSize, width: number, height: number): number {
  return Math.min(
    (size.width - 96) / width,
    (size.height - 96) / height,
    1,
  );
}

function clampPoint(point: { x: number; y: number }, artboard: CalqoArtboard) {
  return {
    x: Math.min(artboard.width, Math.max(0, point.x)),
    y: Math.min(artboard.height, Math.max(0, point.y)),
  };
}

export function CalqoStage({ project, artboard }: CalqoStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRefs = useRef<NodeRegistry>(new Map());
  const [size, setSize] = useState<StageSize>({ width: 1, height: 1 });
  const [pendingAssetPoint, setPendingAssetPoint] = useState({ x: 96, y: 96 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);
  const stageWidth = size.width;
  const stageHeight = size.height;

  const activeTool = useUiStore((s) => s.activeTool);
  const zoom = useUiStore((s) => s.zoom);
  const pan = useUiStore((s) => s.pan);
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const guides = useUiStore((s) => s.guides);
  const setZoom = useUiStore((s) => s.setZoom);
  const setPan = useUiStore((s) => s.setPan);
  const setGuides = useUiStore((s) => s.setGuides);
  const setActiveTool = useUiStore((s) => s.setActiveTool);
  const selectedLayerIds = useSelectionStore((s) => s.selectedLayerIds);
  const selectOne = useSelectionStore((s) => s.selectOne);
  const setSelection = useSelectionStore((s) => s.setSelection);
  const toggleSelection = useSelectionStore((s) => s.toggleSelection);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setActiveArtboard = useSelectionStore((s) => s.setActiveArtboard);

  const artboardX = (stageWidth - artboard.width * zoom) / 2 + pan.x;
  const artboardY = (stageHeight - artboard.height * zoom) / 2 + pan.y;
  const selectedLayers = useMemo(
    () =>
      selectedLayerIds
        .map((id) => findLayerInArtboard(artboard, id))
        .filter((layer): layer is CalqoLayer => Boolean(layer)),
    [artboard, selectedLayerIds],
  );
  const editingLayer = editingTextId
    ? (findLayerInArtboard(artboard, editingTextId) as TextLayer | null)
    : null;

  useEffect(() => {
    setActiveArtboard(artboard.id);
    setZoom(
      fitZoom({ width: stageWidth, height: stageHeight }, artboard.width, artboard.height),
    );
    setPan({ x: 0, y: 0 });
  }, [artboard.id, artboard.height, artboard.width, setActiveArtboard, setPan, setZoom, stageHeight, stageWidth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedLayers
      .filter((layer) => !layer.locked && layer.visible)
      .map((layer) => nodeRefs.current.get(layer.id))
      .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key !== 'Enter') return;
      const only = selectedLayers.length === 1 ? selectedLayers[0] : null;
      if (only?.type === 'text' && !only.locked) {
        event.preventDefault();
        setEditingTextId(only.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLayers]);

  const toArtboardPoint = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return { x: 0, y: 0 };
    return clampPoint(
      {
        x: (pointer.x - artboardX) / zoom,
        y: (pointer.y - artboardY) / zoom,
      },
      artboard,
    );
  };

  const importFiles = async (files: FileList | File[], point = pendingAssetPoint) => {
    const file = Array.from(files).find((candidate) =>
      ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(candidate.type),
    );
    if (!file) return;
    const measured = await measureImage(file);
    const asset = await assetStorage.saveAsset(project.id, file, {
      kind: file.type === 'image/svg+xml' ? 'svg' : 'raster',
      name: file.name,
      mimeType: file.type,
      width: measured.width,
      height: measured.height,
    });
    addImportedAssetLayer(project.id, asset, point.x, point.y);
    setActiveTool('select');
  };

  const openAssetPicker = (point: { x: number; y: number }) => {
    setPendingAssetPoint(point);
    fileInputRef.current?.click();
  };

  const handleStagePointerDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.target !== event.target.getStage()) return;
    const point = toArtboardPoint();
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > artboard.width ||
      point.y > artboard.height
    ) {
      clearSelection();
      return;
    }
    if (activeTool === 'text') {
      const layer = createTextLayer(project, point.x, point.y);
      addLayerToActiveArtboard(project.id, layer);
      setActiveTool('select');
      return;
    }
    if (activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'line') {
      setDraftShape({ shape: activeTool, start: point, current: point });
      return;
    }
    if (activeTool === 'image' || activeTool === 'svg') {
      openAssetPicker(point);
      return;
    }
    clearSelection();
  };

  const selectLayer = (layer: CalqoLayer, additive: boolean) => {
    if (layer.locked) return;
    if (additive) toggleSelection(layer.id);
    else selectOne(layer.id);
  };

  const snapNode = (layer: CalqoLayer, node: Konva.Node) => {
    if (!snapEnabled) return;
    const rect = node.getClientRect({ relativeTo: node.getParent() ?? undefined });
    const candidatesX = [0, artboard.width / 2, artboard.width];
    const candidatesY = [0, artboard.height / 2, artboard.height];
    flattenLayers(artboard.layers)
      .filter((candidate) => candidate.id !== layer.id && candidate.visible)
      .forEach((candidate) => {
        candidatesX.push(candidate.x, candidate.x + candidate.w / 2, candidate.x + candidate.w);
        candidatesY.push(candidate.y, candidate.y + candidate.h / 2, candidate.y + candidate.h);
      });
    const nodeX = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
    const nodeY = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
    const nextGuides: { axis: 'x' | 'y'; position: number }[] = [];
    let dx = 0;
    let dy = 0;

    for (const candidate of candidatesX) {
      const match = nodeX.find((value) => Math.abs(value - candidate) <= SNAP_DISTANCE);
      if (match !== undefined) {
        dx = candidate - match;
        nextGuides.push({ axis: 'x', position: candidate });
        break;
      }
    }
    for (const candidate of candidatesY) {
      const match = nodeY.find((value) => Math.abs(value - candidate) <= SNAP_DISTANCE);
      if (match !== undefined) {
        dy = candidate - match;
        nextGuides.push({ axis: 'y', position: candidate });
        break;
      }
    }
    if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy });
    setGuides(nextGuides);
  };

  const normalizeNode = (layer: CalqoLayer, node: Konva.Node) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const width = Math.max(1, layer.w * scaleX);
    const height = Math.max(1, layer.h * scaleY);
    node.scale({ x: 1, y: 1 });
    if (layer.type === 'shape' && layer.shape === 'ellipse') {
      updateLayerInActiveArtboard(project.id, layer.id, {
        x: node.x() - width / 2,
        y: node.y() - height / 2,
        w: width,
        h: height,
        rotation: node.rotation(),
      });
      return;
    }
    updateLayerInActiveArtboard(project.id, layer.id, {
      x: node.x(),
      y: node.y(),
      w: width,
      h: height,
      rotation: node.rotation(),
    });
  };

  const commitDraftShape = () => {
    if (!draftShape) return;
    const { start, current, shape } = draftShape;
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    const moved = width > 4 || height > 4;
    const x = moved ? Math.min(start.x, current.x) : start.x;
    const y = moved ? Math.min(start.y, current.y) : start.y;
    const layer = createShapeLayer(
      shape,
      x,
      y,
      moved ? Math.max(1, width) : 220,
      shape === 'line' ? (moved ? current.y - start.y : 1) : moved ? Math.max(1, height) : 150,
    );
    if (shape === 'line') {
      layer.x = start.x;
      layer.y = start.y;
      layer.w = moved ? Math.max(1, Math.abs(current.x - start.x)) : 220;
      layer.h = moved ? current.y - start.y : 1;
      if (layer.type === 'shape') {
        layer.points = [0, 0, current.x - start.x || 220, current.y - start.y || 1];
      }
    }
    addLayerToActiveArtboard(project.id, layer);
    setDraftShape(null);
    setActiveTool('select');
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        const point = rect
          ? clampPoint(
              {
                x: (event.clientX - rect.left - artboardX) / zoom,
                y: (event.clientY - rect.top - artboardY) / zoom,
              },
              artboard,
            )
          : pendingAssetPoint;
        void importFiles(event.dataTransfer.files, point);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={activeTool === 'svg' ? 'image/svg+xml' : 'image/png,image/jpeg,image/webp,image/svg+xml'}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files);
          event.currentTarget.value = '';
        }}
      />
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable={activeTool === 'pan'}
        onMouseDown={handleStagePointerDown}
        onMouseMove={() => {
          if (!draftShape) return;
          setDraftShape({ ...draftShape, current: toArtboardPoint() });
        }}
        onMouseUp={commitDraftShape}
        onDragEnd={(event) => {
          if (activeTool !== 'pan') return;
          setPan({ x: pan.x + event.target.x(), y: pan.y + event.target.y() });
          event.target.position({ x: 0, y: 0 });
        }}
        onWheel={(event) => {
          event.evt.preventDefault();
          const direction = event.evt.deltaY > 0 ? -1 : 1;
          setZoom(zoom * (direction > 0 ? 1.08 : 0.92));
        }}
      >
        <Layer>
          <Rect width={size.width} height={size.height} fill="transparent" listening={false} />
          <Rect
            x={artboardX}
            y={artboardY}
            width={artboard.width * zoom}
            height={artboard.height * zoom}
            fill={backgroundColor(artboard)}
            shadowColor="rgba(0,0,0,0.24)"
            shadowBlur={34}
            shadowOffsetY={18}
            stroke="rgba(0,0,0,0.14)"
            strokeWidth={1}
            listening={false}
          />
        </Layer>
        <Layer x={artboardX} y={artboardY} scaleX={zoom} scaleY={zoom} clipX={0} clipY={0} clipWidth={artboard.width} clipHeight={artboard.height}>
          {artboard.layers.map((layer) => (
            <LayerRenderer
              key={layer.id}
              layer={layer}
              activeLocale={project.activeContentLocale}
              selected={selectedLayerIds.includes(layer.id)}
              nodeRefs={nodeRefs}
              onSelect={selectLayer}
              onDragMove={snapNode}
              onDragEnd={(layerToUpdate, node) => {
                setGuides([]);
                normalizeNode(layerToUpdate, node);
              }}
              onTransformEnd={normalizeNode}
              onTextEdit={(layerToEdit) => {
                if (layerToEdit.type === 'text' && !layerToEdit.locked) {
                  setSelection([layerToEdit.id]);
                  setEditingTextId(layerToEdit.id);
                }
              }}
            />
          ))}
          {draftShape && (
            draftShape.shape === 'ellipse' ? (
              <Rect
                x={Math.min(draftShape.start.x, draftShape.current.x)}
                y={Math.min(draftShape.start.y, draftShape.current.y)}
                width={Math.abs(draftShape.current.x - draftShape.start.x)}
                height={Math.abs(draftShape.current.y - draftShape.start.y)}
                stroke="#007AFF"
                dash={[8 / zoom, 5 / zoom]}
                cornerRadius={999}
              />
            ) : draftShape.shape === 'line' ? (
              <Line
                points={[
                  draftShape.start.x,
                  draftShape.start.y,
                  draftShape.current.x,
                  draftShape.current.y,
                ]}
                stroke="#007AFF"
                strokeWidth={2 / zoom}
                lineCap="round"
              />
            ) : (
              <Rect
                x={Math.min(draftShape.start.x, draftShape.current.x)}
                y={Math.min(draftShape.start.y, draftShape.current.y)}
                width={Math.abs(draftShape.current.x - draftShape.start.x)}
                height={Math.abs(draftShape.current.y - draftShape.start.y)}
                stroke="#007AFF"
                dash={[8 / zoom, 5 / zoom]}
              />
            )
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
              strokeWidth={1 / zoom}
              dash={[8 / zoom, 5 / zoom]}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            ignoreStroke
            boundBoxFunc={(_, next) =>
              next.width < 8 || next.height < 8 ? _ : next
            }
            anchorStroke="#007AFF"
            anchorFill="#FFFFFF"
            anchorSize={9 / zoom}
            borderStroke="#007AFF"
            borderDash={[6 / zoom, 4 / zoom]}
          />
        </Layer>
      </Stage>
      {editingLayer && (
        <TextEditOverlay
          layer={editingLayer}
          locale={project.activeContentLocale}
          node={nodeRefs.current.get(editingLayer.id) ?? null}
          stageScale={zoom}
          onCommit={(value) => {
            updateLayerInActiveArtboard(project.id, editingLayer.id, {
              text: { [project.activeContentLocale]: value },
            });
            setEditingTextId(null);
          }}
          onCancel={() => setEditingTextId(null)}
        />
      )}
    </div>
  );
}
