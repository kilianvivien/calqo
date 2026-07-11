import { useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useTranslation } from 'react-i18next';
import {
  addImportedAssetLayer,
  addLayerToActiveArtboard,
  commitListInlineEdit,
  createArrowLayer,
  createCustomPolygonLayer,
  createFreehandLayer,
  createListLayer,
  createPolygonShapeLayer,
  createShapeLayer,
  createTextLayer,
  deleteSelectedLayers,
  duplicateSelectedLayers,
  groupSelectedLayers,
  polygonPoints,
  type PolygonPreset,
  ungroupSelected,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard, flattenLayers, isGroupLayer } from '@/editor/utils/layers';
import { markerGlyphWidth } from '@/editor/i18n-content/translationPipeline';
import type {
  CalqoArtboard,
  CalqoLayer,
  CalqoProject,
  ListLayer,
  TextLayer,
} from '@/lib/schema';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import { useCoarsePointer } from '@/lib/hooks/useResponsiveMode';
import { saveImageAsset } from '@/lib/utils/imageAsset';
import { TextEditOverlay } from './TextEditOverlay';
import { LayerRenderer, type NodeRegistry } from './LayerRenderer';
import { ArtboardBackground } from './ArtboardBackground';
import { CanvasContextMenu } from './CanvasContextMenu';
import { registerStageSampler } from './stageSampler';
import { useAssetImage } from './useAssetImage';
import { computeSnap, SNAP_DISTANCE } from './snapping';
import {
  appendPressure,
  pressureOutlinePoints,
  pressuresToWidths,
  type PressureTrace,
} from './freehandGeometry';
import {
  clampCropView,
  initCropView,
  resizeCropFrame,
  viewToCropRect,
  zoomCropView,
  type CropFrame,
  type CropHandle,
  type CropView,
} from './cropGeometry';

interface CalqoStageProps {
  project: CalqoProject;
  artboard: CalqoArtboard;
}

interface StageSize {
  width: number;
  height: number;
}

type DraftShape = {
  shape: ShapeTool;
  start: { x: number; y: number };
  current: { x: number; y: number };
};

/** Live rubber-band rectangle for the marquee selection tool (artboard coords). */
type Marquee = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

/** Where the canvas context menu is anchored (container-relative pixels). */
type ContextMenuState = { x: number; y: number };

type ShapeTool = 'rect' | 'ellipse' | 'line' | 'arrow' | PolygonPreset;

const TRANSFORMER_ANCHOR_SIZE = 5;
/** Finger-sized transform anchor for coarse pointers (iPad / touch screens). */
const TRANSFORMER_ANCHOR_SIZE_TOUCH = 11;
/** On-screen size (px, pre-zoom) of a crop reframe handle. */
const CROP_HANDLE_SIZE = 12;
/** Finger-sized crop reframe handle for coarse pointers. */
const CROP_HANDLE_SIZE_TOUCH = 22;
/** Long-press (ms) on the canvas opens the context menu — touch has no
 * right-click. Movement beyond the tolerance means a drag, not a hold. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 12;
/** Zoom bounds during a pinch — mirrors the clamp in `uiStore.setZoom` so the
 * pan computed alongside the scale stays consistent with what the store keeps. */
const PINCH_MIN_ZOOM = 0.05;
const PINCH_MAX_ZOOM = 4;

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
/** CSS cursor for each crop reframe handle, by compass direction. */
const CROP_HANDLE_CURSOR: Record<CropHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};
/** The eight handle anchor points of a crop frame, in artboard coordinates. */
function cropHandleAnchors(frame: CropFrame): [CropHandle, number, number][] {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const right = frame.x + frame.w;
  const bottom = frame.y + frame.h;
  return [
    ['nw', frame.x, frame.y],
    ['n', cx, frame.y],
    ['ne', right, frame.y],
    ['e', right, cy],
    ['se', right, bottom],
    ['s', cx, bottom],
    ['sw', frame.x, bottom],
    ['w', frame.x, cy],
  ];
}
const SHAPE_TOOLS = new Set<string>([
  'rect',
  'ellipse',
  'line',
  'arrow',
  'triangle',
  'diamond',
  'badge',
  'star',
]);

function previewPolygonPoints(shape: PolygonPreset, w: number, h: number): number[] {
  return polygonPoints(shape, Math.max(1, w), Math.max(1, h));
}

function channelToHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

/** Whether a single line-like shape (line/arrow) is the only selection. Their
 * Konva bounding box is paper-thin, so the transformer needs extra padding and
 * a longer rotate handle to be grabbable. */
function isLineLikeSelection(layers: CalqoLayer[]): boolean {
  if (layers.length !== 1) return false;
  const only = layers[0];
  return only.type === 'shape' && (only.shape === 'line' || only.shape === 'arrow');
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
  // Marquee selection: a rubber-band box that selects intersecting layers.
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  // Right-click context menu (group / ungroup / duplicate / delete).
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Pen tool: a growing list of committed vertices plus a live cursor point.
  const [penPoints, setPenPoints] = useState<number[]>([]);
  const [penCursor, setPenCursor] = useState<{ x: number; y: number } | null>(null);
  // Brush tool: the in-progress freehand path (null when not drawing).
  const [drawPoints, setDrawPoints] = useState<number[] | null>(null);
  // Pressure samples for the stroke above (Apple Pencil / stylus force).
  const drawPressures = useRef<PressureTrace | null>(null);
  // Colour-sampling mode (eyedropper fallback): a click reads a stage pixel.
  const [sampling, setSampling] = useState(false);
  const samplerCbRef = useRef<((hex: string | null) => void) | null>(null);
  // Two-finger pinch in progress: the content layer stops listening so a pinch
  // never doubles as a layer drag.
  const [pinching, setPinching] = useState(false);
  // Armed long-press (touch): fires the context menu if the finger stays put.
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  // Pen tool on touch: the vertex commits on finger-up so a second finger
  // (pinch) never leaves a stray point behind.
  const penTapCandidate = useRef<{ x: number; y: number; point: { x: number; y: number } } | null>(null);
  const coarsePointer = useCoarsePointer();
  const stageWidth = size.width;
  const stageHeight = size.height;

  const { t } = useTranslation('editor');
  const activeTool = useUiStore((s) => s.activeTool);
  const zoom = useUiStore((s) => s.zoom);
  const pan = useUiStore((s) => s.pan);
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const guides = useUiStore((s) => s.guides);
  const shapeDefaults = useUiStore((s) => s.shapeDefaults);
  const fitRequest = useUiStore((s) => s.fitRequest);
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
  const croppingLayerId = useUiStore((s) => s.croppingLayerId);
  const setCroppingLayerId = useUiStore((s) => s.setCroppingLayerId);

  // Interactive image crop: the targeted image layer, its source bitmap, and the
  // live view (image position/scale behind the fixed crop frame).
  const croppingLayer = useMemo(() => {
    if (!croppingLayerId) return null;
    const found = findLayerInArtboard(artboard, croppingLayerId);
    return found && found.type === 'image' ? found : null;
  }, [artboard, croppingLayerId]);
  const { image: cropImage } = useAssetImage(croppingLayer?.assetId ?? null);
  const [cropView, setCropView] = useState<CropView | null>(null);
  // The crop frame is the layer's footprint on the artboard; reframe handles
  // resize it live, so it lives in state (seeded from the layer on entry) rather
  // than being derived. Committing writes the resized frame back as the layer
  // rect along with the image-pixel crop rect.
  const [cropFrame, setCropFrame] = useState<CropFrame | null>(null);
  // Frame captured when a reframe handle drag begins, so each move resolves
  // relative to a stable origin rather than the live (already-moving) frame.
  const cropResizeStart = useRef<CropFrame | null>(null);
  const cropIw = cropImage?.naturalWidth ?? 0;
  const cropIh = cropImage?.naturalHeight ?? 0;

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
    ? (findLayerInArtboard(artboard, editingTextId) as TextLayer | ListLayer | null)
    : null;
  const lineLikeSelection = useMemo(() => isLineLikeSelection(selectedLayers), [selectedLayers]);
  // Group when ≥2 top-level layers are selected; ungroup when a single group is.
  const topLevelSelectedCount = useMemo(
    () => artboard.layers.filter((layer) => selectedLayerIds.includes(layer.id)).length,
    [artboard.layers, selectedLayerIds],
  );
  const canGroup = topLevelSelectedCount >= 2;
  const canUngroup = selectedLayers.length === 1 && isGroupLayer(selectedLayers[0]);

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

  // Live values for the imperative pinch handlers below, which bind once.
  const pinchState = useRef({
    zoom,
    pan,
    stageWidth,
    stageHeight,
    artW: artboard.width,
    artH: artboard.height,
    croppingLayerId,
    cropView,
    cropFrame,
    cropIw,
    cropIh,
  });
  pinchState.current = {
    zoom,
    pan,
    stageWidth,
    stageHeight,
    artW: artboard.width,
    artH: artboard.height,
    croppingLayerId,
    cropView,
    cropFrame,
    cropIw,
    cropIh,
  };

  // Two-finger pinch-zoom + pan (iPad / touch screens). One finger stays with
  // Konva for selecting, dragging, and the drawing tools, so the gestures never
  // fight. Bound natively so we can preventDefault (React touch listeners are
  // passive). While cropping, the pinch zooms the image inside the crop frame.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let gesture: {
      dist: number;
      cx: number;
      cy: number;
      zoom: number;
      pan: { x: number; y: number };
    } | null = null;
    let cropDist = 0;

    const localCenter = (a: Touch, b: Touch) => {
      const rect = el.getBoundingClientRect();
      return {
        x: (a.clientX + b.clientX) / 2 - rect.left,
        y: (a.clientY + b.clientY) / 2 - rect.top,
      };
    };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      const [a, b] = [event.touches[0], event.touches[1]];
      const s = pinchState.current;
      const c = localCenter(a, b);
      gesture = { dist: touchDistance(a, b), cx: c.x, cy: c.y, zoom: s.zoom, pan: s.pan };
      cropDist = gesture.dist;
      // A second finger means a gesture, never tool input — drop in-progress
      // drafts and the armed long-press so nothing half-drawn commits.
      if (longPress.current) {
        window.clearTimeout(longPress.current.timer);
        longPress.current = null;
      }
      penTapCandidate.current = null;
      setDraftShape(null);
      setMarquee(null);
      setDrawPoints(null);
      setGuides([]);
      setPinching(true);
    };

    const onMove = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 2) return;
      event.preventDefault();
      const [a, b] = [event.touches[0], event.touches[1]];
      const s = pinchState.current;
      if (s.croppingLayerId && s.cropView && s.cropFrame) {
        const dist = touchDistance(a, b);
        const factor = dist / (cropDist || dist);
        cropDist = dist;
        setCropView(zoomCropView(s.cropView, s.cropFrame, factor, s.cropIw, s.cropIh));
        return;
      }
      const ratio = touchDistance(a, b) / gesture.dist;
      const scale = Math.min(
        PINCH_MAX_ZOOM,
        Math.max(PINCH_MIN_ZOOM, gesture.zoom * ratio),
      );
      // Anchor the zoom on the artboard point under the initial midpoint, and
      // pan with the midpoint so a two-finger drag also moves the canvas. The
      // origin mirrors the artboardX/artboardY layout math.
      const ox = (s.stageWidth - s.artW * gesture.zoom) / 2 + gesture.pan.x;
      const oy = (s.stageHeight - s.artH * gesture.zoom) / 2 + gesture.pan.y;
      const wx = (gesture.cx - ox) / gesture.zoom;
      const wy = (gesture.cy - oy) / gesture.zoom;
      const c = localCenter(a, b);
      setZoom(scale);
      setPan({
        x: c.x - wx * scale - (s.stageWidth - s.artW * scale) / 2,
        y: c.y - wy * scale - (s.stageHeight - s.artH * scale) / 2,
      });
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
  }, [setGuides, setPan, setZoom]);

  useEffect(() => {
    if (fitRequest === 0) return;
    setZoom(
      fitZoom({ width: stageWidth, height: stageHeight }, artboard.width, artboard.height),
    );
    setPan({ x: 0, y: 0 });
  }, [fitRequest, artboard.width, artboard.height, setPan, setZoom, stageHeight, stageWidth]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    // No transform handles while cropping — the crop editor owns interaction.
    const nodes = croppingLayerId
      ? []
      : selectedLayers
          .filter((layer) => !layer.locked && layer.visible)
          .map((layer) => nodeRefs.current.get(layer.id))
          .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayers, croppingLayerId]);

  // Seed the crop frame and view when entering crop mode (or when the bitmap
  // loads): the frame starts as the layer's current rect.
  useEffect(() => {
    if (!croppingLayerId || !cropImage || !croppingLayer) {
      setCropView(null);
      setCropFrame(null);
      return;
    }
    const frame: CropFrame = {
      x: croppingLayer.x,
      y: croppingLayer.y,
      w: croppingLayer.w,
      h: croppingLayer.h,
    };
    setCropFrame(frame);
    setCropView(initCropView(cropIw, cropIh, frame, croppingLayer.crop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [croppingLayerId, cropImage]);

  const commitCrop = () => {
    if (croppingLayer && cropView && cropFrame) {
      const crop = viewToCropRect(cropView, cropFrame, cropIw, cropIh);
      // The reframed crop frame becomes the layer's new footprint.
      updateLayerInActiveArtboard(project.id, croppingLayer.id, {
        crop,
        x: cropFrame.x,
        y: cropFrame.y,
        w: cropFrame.w,
        h: cropFrame.h,
      });
    }
    setCroppingLayerId(null);
  };
  const cancelCrop = () => setCroppingLayerId(null);

  useEffect(() => {
    if (!croppingLayerId) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitCrop();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelCrop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [croppingLayerId, cropView, cropImage]);

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
      if ((only?.type === 'text' || only?.type === 'list') && !only.locked) {
        event.preventDefault();
        setEditingTextId(only.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLayers]);

  // Pen/brush drafts are tool-scoped; drop them when switching tools.
  useEffect(() => {
    if (activeTool !== 'pen') {
      setPenPoints([]);
      setPenCursor(null);
    }
    if (activeTool !== 'brush') setDrawPoints(null);
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== 'pen') return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        finalizePenPolygon();
      } else if (event.key === 'Escape') {
        setPenPoints([]);
        setPenCursor(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, penPoints]);

  // Expose a colour sampler so the inspector's eyedropper works in every
  // browser (Safari/WebKit ships no native EyeDropper). Begin arms a one-shot
  // sampling click; the resolver is invoked from handleStagePointerDown.
  useEffect(() => {
    registerStageSampler({
      begin: (onPick) => {
        samplerCbRef.current = onPick;
        setSampling(true);
      },
    });
    return () => registerStageSampler(null);
  }, []);

  useEffect(() => {
    if (!sampling) return undefined;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      samplerCbRef.current?.(null);
      samplerCbRef.current = null;
      setSampling(false);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [sampling]);

  const sampleStageColor = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    const callback = samplerCbRef.current;
    samplerCbRef.current = null;
    setSampling(false);
    if (!stage || !pointer || !callback) {
      callback?.(null);
      return;
    }
    try {
      const sampled = stage.toCanvas({
        x: pointer.x,
        y: pointer.y,
        width: 1,
        height: 1,
        pixelRatio: 1,
      });
      const data = sampled.getContext('2d')?.getImageData(0, 0, 1, 1).data;
      if (!data) {
        callback(null);
        return;
      }
      callback(`#${channelToHex(data[0])}${channelToHex(data[1])}${channelToHex(data[2])}`.toUpperCase());
    } catch {
      // Tainted canvas (cross-origin asset) — fail gracefully.
      callback(null);
    }
  };

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
    const asset = await saveImageAsset(project.id, file);
    addImportedAssetLayer(project.id, asset, point.x, point.y);
    setActiveTool('select');
  };

  const openAssetPicker = (point: { x: number; y: number }) => {
    setPendingAssetPoint(point);
    fileInputRef.current?.click();
  };

  const cancelLongPress = () => {
    if (longPress.current) {
      window.clearTimeout(longPress.current.timer);
      longPress.current = null;
    }
  };

  const handleStagePointerDown = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const evt = event.evt;
    const isTouch = 'touches' in evt;
    // A second finger is the pinch gesture (handled natively), never tool input.
    if (isTouch && evt.touches.length > 1) return;
    // Touch: arm a long-press to open the context menu (no right-click on iPad).
    if (isTouch && activeTool === 'select' && !croppingLayerId && !sampling) {
      cancelLongPress();
      const touch = evt.touches[0];
      if (touch) {
        const target = event.target === event.target.getStage() ? null : event.target;
        const { clientX, clientY } = touch;
        const timer = window.setTimeout(() => {
          longPress.current = null;
          // A hold that turned into a transform is not a context-menu press.
          if (transformerRef.current?.isTransforming()) return;
          openContextMenuAt(clientX, clientY, target);
        }, LONG_PRESS_MS);
        longPress.current = { timer, x: clientX, y: clientY };
      }
    }
    // A left-click or tap anywhere dismisses an open context menu.
    if (!('button' in evt) || evt.button === 0) setContextMenu(null);
    // While cropping, the crop editor owns all canvas interaction.
    if (croppingLayerId) return;
    // Sampling intercepts every click (including over shapes) before any tool.
    if (sampling) {
      evt.preventDefault();
      sampleStageColor();
      return;
    }
    if (event.target !== event.target.getStage()) return;
    const point = toArtboardPoint();
    if (activeTool === 'marquee') {
      setMarquee({ start: point, current: point });
      return;
    }
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > artboard.width ||
      point.y > artboard.height
    ) {
      clearSelection();
      return;
    }
    if (activeTool === 'pen') {
      if (isTouch) {
        // Defer to finger-up: if this touch becomes a pinch or a drag, no
        // vertex should land.
        const touch = evt.touches[0];
        if (touch) {
          penTapCandidate.current = { x: touch.clientX, y: touch.clientY, point };
        }
        return;
      }
      setPenPoints((prev) => [...prev, point.x, point.y]);
      setPenCursor(point);
      return;
    }
    if (activeTool === 'brush') {
      drawPressures.current = { values: [], real: false };
      appendPressure(drawPressures.current, evt);
      setDrawPoints([point.x, point.y]);
      return;
    }
    if (activeTool === 'text') {
      const layer = createTextLayer(project, point.x, point.y);
      addLayerToActiveArtboard(project.id, layer);
      setActiveTool('select');
      return;
    }
    if (activeTool === 'list') {
      const layer = createListLayer(project, point.x, point.y);
      addLayerToActiveArtboard(project.id, layer);
      setActiveTool('select');
      return;
    }
    if (SHAPE_TOOLS.has(activeTool)) {
      setDraftShape({ shape: activeTool as ShapeTool, start: point, current: point });
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
    if (selectedLayerIds.length > 1 && selectedLayerIds.includes(layer.id)) {
      setGuides([]);
      return;
    }
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

  const normalizeNode = (layer: CalqoLayer, node: Konva.Node) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const width = Math.max(1, layer.w * scaleX);
    const height = Math.max(1, layer.h * scaleY);
    node.scale({ x: 1, y: 1 });
    if (layer.type === 'group') {
      // Konva scaled the children visually; bake that into their schema coords.
      updateLayerInActiveArtboard(project.id, layer.id, {
        x: node.x(),
        y: node.y(),
        w: width,
        h: height,
        rotation: node.rotation(),
        groupScale: { sx: scaleX, sy: scaleY },
      });
      return;
    }
    // A plain ellipse node is centre-anchored; a sticker-decorated ellipse is
    // wrapped in a top-left-anchored Group, so it falls through to the generic
    // resize below (which rebuilds the decoration at the new size).
    if (layer.type === 'shape' && layer.shape === 'ellipse' && !layer.sticker) {
      updateLayerInActiveArtboard(project.id, layer.id, {
        x: node.x() - width / 2,
        y: node.y() - height / 2,
        w: width,
        h: height,
        rotation: node.rotation(),
      });
      return;
    }
    if (layer.type === 'shape' && layer.points) {
      updateLayerInActiveArtboard(project.id, layer.id, {
        x: node.x(),
        y: node.y(),
        w: width,
        h: height,
        rotation: node.rotation(),
        points: layer.points.map((value, i) => value * (i % 2 === 0 ? scaleX : scaleY)),
        // Pressure widths follow the average axis scale (no per-axis width).
        ...(layer.pointWidths
          ? { pointWidths: layer.pointWidths.map((value) => (value * (scaleX + scaleY)) / 2) }
          : {}),
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

    if (shape === 'arrow') {
      const end = moved ? current : { x: start.x + 220, y: start.y };
      addLayerToActiveArtboard(
        project.id,
        createArrowLayer(start.x, start.y, end.x, end.y, shapeDefaults),
      );
      setDraftShape(null);
      setActiveTool('select');
      return;
    }

    const x = moved ? Math.min(start.x, current.x) : start.x;
    const y = moved ? Math.min(start.y, current.y) : start.y;
    const nextW = moved ? Math.max(1, width) : 220;
    const nextH =
      shape === 'line' ? (moved ? current.y - start.y : 1) : moved ? Math.max(1, height) : 150;
    const layer =
      shape === 'rect' || shape === 'ellipse' || shape === 'line'
        ? createShapeLayer(shape, x, y, nextW, nextH, shapeDefaults)
        : createPolygonShapeLayer(shape, x, y, nextW, Math.max(1, Math.abs(nextH)), shapeDefaults);
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

  /** Finalize a marquee drag: select every top-level layer whose box overlaps
   * the swept rectangle. A click without a drag just clears the selection. */
  const commitMarquee = () => {
    if (!marquee) return;
    const x1 = Math.min(marquee.start.x, marquee.current.x);
    const y1 = Math.min(marquee.start.y, marquee.current.y);
    const x2 = Math.max(marquee.start.x, marquee.current.x);
    const y2 = Math.max(marquee.start.y, marquee.current.y);
    setMarquee(null);
    if (x2 - x1 < 3 && y2 - y1 < 3) {
      clearSelection();
      return;
    }
    const hits = artboard.layers.filter(
      (layer) =>
        !layer.locked &&
        layer.visible &&
        layer.x < x2 &&
        layer.x + layer.w > x1 &&
        layer.y < y2 &&
        layer.y + layer.h > y1,
    );
    setSelection(hits.map((layer) => layer.id));
  };

  /** Map a Konva node to the id of the top-level artboard layer it belongs to
   * (climbing out of any group), or null if it is the stage background. */
  const topLevelLayerIdFor = (node: Konva.Node | null): string | null => {
    let current: Konva.Node | null = node;
    while (current) {
      const id = typeof current.id === 'function' ? current.id() : undefined;
      if (id && artboard.layers.some((layer) => layer.id === id)) return id;
      current = current.getParent();
    }
    return null;
  };

  /** Open the canvas context menu at a client point, selecting the top-level
   * layer under it first (shared by right-click and touch long-press). */
  const openContextMenuAt = (
    clientX: number,
    clientY: number,
    target: Konva.Node | null,
  ) => {
    const targetId = topLevelLayerIdFor(target);
    if (targetId) {
      if (!selectedLayerIds.includes(targetId)) selectOne(targetId);
    }
    const rect = containerRef.current?.getBoundingClientRect();
    setContextMenu({
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    });
  };

  const handleContextMenu = (event: Konva.KonvaEventObject<PointerEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    openContextMenuAt(
      event.evt.clientX,
      event.evt.clientY,
      event.target === stage ? null : event.target,
    );
  };

  const commitFreehand = () => {
    if (!drawPoints) return;
    const trace = drawPressures.current;
    drawPressures.current = null;
    const layer = createFreehandLayer(
      drawPoints,
      shapeDefaults,
      trace?.real ? trace.values : undefined,
    );
    setDrawPoints(null);
    if (layer) {
      addLayerToActiveArtboard(project.id, layer);
      setActiveTool('select');
    }
  };

  const finalizePenPolygon = () => {
    if (penPoints.length < 6) {
      setPenPoints([]);
      setPenCursor(null);
      return;
    }
    const layer = createCustomPolygonLayer(penPoints, shapeDefaults);
    setPenPoints([]);
    setPenCursor(null);
    if (layer) {
      addLayerToActiveArtboard(project.id, layer);
      setActiveTool('select');
    }
  };

  const handleStagePointerMove = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const evt = event.evt;
    if ('touches' in evt) {
      // Real movement means a drag, not a long-press hold or a pen tap.
      const touch = evt.touches[0];
      const lp = longPress.current;
      if (lp && touch) {
        if (
          Math.hypot(touch.clientX - lp.x, touch.clientY - lp.y) >
          LONG_PRESS_MOVE_TOLERANCE
        ) {
          cancelLongPress();
        }
      }
      const penTap = penTapCandidate.current;
      if (penTap && touch) {
        if (
          Math.hypot(touch.clientX - penTap.x, touch.clientY - penTap.y) >
          LONG_PRESS_MOVE_TOLERANCE
        ) {
          penTapCandidate.current = null;
        }
      }
      // Two-finger moves belong to the native pinch handlers.
      if (evt.touches.length > 1) return;
    }
    if (pinching) return;
    if (marquee) {
      setMarquee({ ...marquee, current: toArtboardPoint() });
      return;
    }
    if (drawPoints) {
      const point = toArtboardPoint();
      if (drawPressures.current) appendPressure(drawPressures.current, evt);
      setDrawPoints([...drawPoints, point.x, point.y]);
      return;
    }
    if (activeTool === 'pen' && penPoints.length > 0) {
      setPenCursor(toArtboardPoint());
      return;
    }
    if (!draftShape) return;
    setDraftShape({ ...draftShape, current: toArtboardPoint() });
  };

  const handleStagePointerUp = () => {
    cancelLongPress();
    const penTap = penTapCandidate.current;
    penTapCandidate.current = null;
    if (pinching) return;
    if (penTap && activeTool === 'pen') {
      setPenPoints((prev) => [...prev, penTap.point.x, penTap.point.y]);
      setPenCursor(penTap.point);
      return;
    }
    if (marquee) {
      commitMarquee();
      return;
    }
    if (drawPoints) {
      commitFreehand();
      return;
    }
    commitDraftShape();
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{
        // The canvas owns every touch gesture (pinch-zoom, tool drags); without
        // this iOS scrolls/zooms the page instead of driving the editor.
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        ...(sampling || activeTool === 'marquee' ? { cursor: 'crosshair' } : undefined),
      }}
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
        onTouchStart={handleStagePointerDown}
        onDblClick={() => {
          if (activeTool === 'pen') finalizePenPolygon();
        }}
        onDblTap={() => {
          if (activeTool === 'pen') finalizePenPolygon();
        }}
        onContextMenu={handleContextMenu}
        onMouseMove={handleStagePointerMove}
        onTouchMove={handleStagePointerMove}
        onMouseUp={handleStagePointerUp}
        onTouchEnd={handleStagePointerUp}
        // Layer/crop drags bubble here; a drag is never a long-press hold.
        onDragStart={cancelLongPress}
        onDragEnd={(event) => {
          if (activeTool !== 'pan') return;
          setPan({ x: pan.x + event.target.x(), y: pan.y + event.target.y() });
          event.target.position({ x: 0, y: 0 });
        }}
        onWheel={(event) => {
          event.evt.preventDefault();
          if (croppingLayerId && cropView && cropFrame) {
            const factor = event.evt.deltaY > 0 ? 0.94 : 1.06;
            setCropView(zoomCropView(cropView, cropFrame, factor, cropIw, cropIh));
            return;
          }
          const direction = event.evt.deltaY > 0 ? -1 : 1;
          setZoom(zoom * (direction > 0 ? 1.08 : 0.92));
        }}
      >
        <Layer>
          <Rect width={size.width} height={size.height} fill="transparent" listening={false} />
          <ArtboardBackground
            background={artboard.background}
            x={artboardX}
            y={artboardY}
            width={artboard.width * zoom}
            height={artboard.height * zoom}
            frameProps={{
              shadowColor: 'rgba(0,0,0,0.24)',
              shadowBlur: 34,
              shadowOffsetY: 18,
              stroke: 'rgba(0,0,0,0.14)',
              strokeWidth: 1,
            }}
          />
        </Layer>
        {/* While pinching, the content stops listening so the gesture never
            doubles as a layer drag or transform. */}
        <Layer x={artboardX} y={artboardY} scaleX={zoom} scaleY={zoom} clipX={0} clipY={0} clipWidth={artboard.width} clipHeight={artboard.height} listening={!pinching}>
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
                if (
                  (layerToEdit.type === 'text' || layerToEdit.type === 'list') &&
                  !layerToEdit.locked
                ) {
                  setSelection([layerToEdit.id]);
                  setEditingTextId(layerToEdit.id);
                }
              }}
              onImageCrop={(layerToCrop) => {
                if (layerToCrop.type === 'image' && !layerToCrop.locked) {
                  setSelection([layerToCrop.id]);
                  setCroppingLayerId(layerToCrop.id);
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
            ) : draftShape.shape === 'rect' ? (
              <Rect
                x={Math.min(draftShape.start.x, draftShape.current.x)}
                y={Math.min(draftShape.start.y, draftShape.current.y)}
                width={Math.abs(draftShape.current.x - draftShape.start.x)}
                height={Math.abs(draftShape.current.y - draftShape.start.y)}
                stroke="#007AFF"
                dash={[8 / zoom, 5 / zoom]}
              />
            ) : draftShape.shape === 'arrow' ? (
              <Arrow
                points={[
                  draftShape.start.x,
                  draftShape.start.y,
                  draftShape.current.x,
                  draftShape.current.y,
                ]}
                stroke="#007AFF"
                fill="#007AFF"
                strokeWidth={3 / zoom}
                pointerLength={14 / zoom}
                pointerWidth={14 / zoom}
                lineCap="round"
              />
            ) : (
              <Line
                x={Math.min(draftShape.start.x, draftShape.current.x)}
                y={Math.min(draftShape.start.y, draftShape.current.y)}
                points={previewPolygonPoints(
                  draftShape.shape,
                  Math.abs(draftShape.current.x - draftShape.start.x),
                  Math.abs(draftShape.current.y - draftShape.start.y),
                )}
                closed
                stroke="#007AFF"
                strokeWidth={2 / zoom}
                dash={[8 / zoom, 5 / zoom]}
                lineJoin="round"
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
          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.current.x)}
              y={Math.min(marquee.start.y, marquee.current.y)}
              width={Math.abs(marquee.current.x - marquee.start.x)}
              height={Math.abs(marquee.current.y - marquee.start.y)}
              fill="rgba(0,122,255,0.10)"
              stroke="#007AFF"
              strokeWidth={1 / zoom}
              dash={[6 / zoom, 4 / zoom]}
              listening={false}
            />
          )}
          {drawPoints &&
            drawPoints.length >= 4 &&
            (drawPressures.current?.real ? (
              <Line
                points={pressureOutlinePoints(
                  drawPoints,
                  pressuresToWidths(drawPressures.current.values, shapeDefaults.brushSize),
                )}
                closed
                fill={shapeDefaults.stroke}
                lineJoin="round"
                listening={false}
              />
            ) : (
              <Line
                points={drawPoints}
                stroke={shapeDefaults.stroke}
                strokeWidth={shapeDefaults.brushSize}
                tension={0.4}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ))}
          {penPoints.length > 0 && (
            <>
              <Line
                points={penCursor ? [...penPoints, penCursor.x, penCursor.y] : penPoints}
                stroke="#007AFF"
                strokeWidth={1.5 / zoom}
                dash={[6 / zoom, 4 / zoom]}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
              {penPoints
                .reduce<{ x: number; y: number }[]>((acc, value, i) => {
                  if (i % 2 === 0) acc.push({ x: value, y: penPoints[i + 1] });
                  return acc;
                }, [])
                .map((vertex, i) => (
                  <Circle
                    key={i}
                    x={vertex.x}
                    y={vertex.y}
                    radius={3 / zoom}
                    fill="#FFFFFF"
                    stroke="#007AFF"
                    strokeWidth={1.5 / zoom}
                    listening={false}
                  />
                ))}
            </>
          )}
          {croppingLayerId && cropImage && cropView && cropFrame && (
            <>
              <KonvaImage
                image={cropImage}
                x={cropView.x}
                y={cropView.y}
                width={cropIw * cropView.scale}
                height={cropIh * cropView.scale}
                draggable
                onDragMove={(event) => {
                  const node = event.target;
                  const next = clampCropView(
                    { scale: cropView.scale, x: node.x(), y: node.y() },
                    cropIw,
                    cropIh,
                    cropFrame,
                  );
                  node.position({ x: next.x, y: next.y });
                }}
                onDragEnd={(event) => {
                  const node = event.target;
                  setCropView(
                    clampCropView(
                      { scale: cropView.scale, x: node.x(), y: node.y() },
                      cropIw,
                      cropIh,
                      cropFrame,
                    ),
                  );
                }}
              />
              <Rect x={0} y={0} width={artboard.width} height={Math.max(0, cropFrame.y)} fill="rgba(0,0,0,0.55)" listening={false} />
              <Rect
                x={0}
                y={cropFrame.y + cropFrame.h}
                width={artboard.width}
                height={Math.max(0, artboard.height - cropFrame.y - cropFrame.h)}
                fill="rgba(0,0,0,0.55)"
                listening={false}
              />
              <Rect x={0} y={cropFrame.y} width={Math.max(0, cropFrame.x)} height={cropFrame.h} fill="rgba(0,0,0,0.55)" listening={false} />
              <Rect
                x={cropFrame.x + cropFrame.w}
                y={cropFrame.y}
                width={Math.max(0, artboard.width - cropFrame.x - cropFrame.w)}
                height={cropFrame.h}
                fill="rgba(0,0,0,0.55)"
                listening={false}
              />
              {[1, 2].map((i) => (
                <Line
                  key={`v${i}`}
                  points={[cropFrame.x + (cropFrame.w * i) / 3, cropFrame.y, cropFrame.x + (cropFrame.w * i) / 3, cropFrame.y + cropFrame.h]}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={1 / zoom}
                  listening={false}
                />
              ))}
              {[1, 2].map((i) => (
                <Line
                  key={`h${i}`}
                  points={[cropFrame.x, cropFrame.y + (cropFrame.h * i) / 3, cropFrame.x + cropFrame.w, cropFrame.y + (cropFrame.h * i) / 3]}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={1 / zoom}
                  listening={false}
                />
              ))}
              <Rect
                x={cropFrame.x}
                y={cropFrame.y}
                width={cropFrame.w}
                height={cropFrame.h}
                stroke="#FFFFFF"
                strokeWidth={1.5 / zoom}
                listening={false}
              />
              {/* Reframe handles — drag to change the crop frame's format. */}
              {cropHandleAnchors(cropFrame).map(([handle, ax, ay]) => {
                const handleSize =
                  (coarsePointer ? CROP_HANDLE_SIZE_TOUCH : CROP_HANDLE_SIZE) / zoom;
                return (
                  <Rect
                    key={handle}
                    x={ax - handleSize / 2}
                    y={ay - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#FFFFFF"
                    stroke="#007AFF"
                    strokeWidth={1.5 / zoom}
                    cornerRadius={handleSize / 4}
                    draggable
                    onMouseEnter={(event) => {
                      const stage = event.target.getStage();
                      if (stage) stage.container().style.cursor = CROP_HANDLE_CURSOR[handle];
                    }}
                    onMouseLeave={(event) => {
                      const stage = event.target.getStage();
                      if (stage) stage.container().style.cursor = '';
                    }}
                    onDragStart={() => {
                      cropResizeStart.current = cropFrame;
                    }}
                    onDragMove={(event) => {
                      const start = cropResizeStart.current;
                      if (!start || !cropView) return;
                      const [, sx, sy] = cropHandleAnchors(start).find(
                        ([h]) => h === handle,
                      )!;
                      const node = event.target;
                      const dx = node.x() + handleSize / 2 - sx;
                      const dy = node.y() + handleSize / 2 - sy;
                      const next = resizeCropFrame(start, handle, dx, dy, {
                        x: 0,
                        y: 0,
                        w: artboard.width,
                        h: artboard.height,
                      });
                      setCropFrame(next);
                      setCropView(clampCropView(cropView, cropIw, cropIh, next));
                      // Snap the handle back onto the clamped frame so it tracks it.
                      const [, nx, ny] = cropHandleAnchors(next).find(
                        ([h]) => h === handle,
                      )!;
                      node.position({ x: nx - handleSize / 2, y: ny - handleSize / 2 });
                    }}
                    onDragEnd={() => {
                      cropResizeStart.current = null;
                    }}
                  />
                );
              })}
            </>
          )}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            ignoreStroke
            useSingleNodeRotation
            // Lines/arrows have a near-flat bounding box; pad it and push the
            // rotate handle further out so it can be grabbed like other shapes.
            // Coarse pointers (iPad) get finger-sized anchors and offsets.
            padding={(lineLikeSelection ? (coarsePointer ? 20 : 14) : 0) / zoom}
            rotateAnchorOffset={
              ((lineLikeSelection ? 36 : 24) + (coarsePointer ? 12 : 0)) / zoom
            }
            boundBoxFunc={(oldBox, next) =>
              // Lines/arrows are legitimately thin — never reject their box, or
              // both rotation and resize get blocked. Other shapes keep a floor.
              !lineLikeSelection && (next.width < 8 || next.height < 8) ? oldBox : next
            }
            anchorStroke="#007AFF"
            anchorFill="#FFFFFF"
            anchorSize={
              (coarsePointer
                ? (lineLikeSelection ? 14 : TRANSFORMER_ANCHOR_SIZE_TOUCH)
                : lineLikeSelection
                  ? 8
                  : TRANSFORMER_ANCHOR_SIZE) / zoom
            }
            rotateAnchorCursor="grab"
            borderStroke="#007AFF"
            borderDash={[6 / zoom, 4 / zoom]}
          />
        </Layer>
      </Stage>
      {editingLayer && (
        <TextEditOverlay
          initialValue={
            editingLayer.type === 'list'
              ? editingLayer.items
                  .map(
                    (row) =>
                      row.text[project.activeContentLocale] ??
                      Object.values(row.text)[0] ??
                      '',
                  )
                  .join('\n')
              : (editingLayer.text[project.activeContentLocale] ??
                Object.values(editingLayer.text)[0] ??
                '')
          }
          textStyle={editingLayer.style}
          rotation={editingLayer.rotation}
          insetLeft={
            editingLayer.type === 'list'
              ? markerGlyphWidth(editingLayer) + editingLayer.markerGap
              : 0
          }
          node={nodeRefs.current.get(editingLayer.id) ?? null}
          stageScale={zoom}
          onCommit={(value) => {
            if (editingLayer.type === 'list') {
              commitListInlineEdit(
                project.id,
                editingLayer.id,
                project.activeContentLocale,
                value.split('\n'),
              );
            } else {
              updateLayerInActiveArtboard(project.id, editingLayer.id, {
                text: { [project.activeContentLocale]: value },
              });
            }
            setEditingTextId(null);
          }}
          onCancel={() => setEditingTextId(null)}
        />
      )}
      {croppingLayerId && cropImage && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full glass px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.22)]">
          <span className="text-[11.5px] text-[var(--calqo-text-2)]">{t('crop.hint')}</span>
          <button
            type="button"
            onClick={cancelCrop}
            className="rounded-full px-3 py-1 text-[12px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
          >
            {t('crop.cancel')}
          </button>
          <button
            type="button"
            onClick={commitCrop}
            className="rounded-full bg-[var(--calqo-accent)] px-3 py-1 text-[12px] font-medium text-[var(--calqo-text-on-accent)] transition-transform active:scale-[0.97]"
          >
            {t('crop.apply')}
          </button>
        </div>
      )}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canGroup={canGroup}
          canUngroup={canUngroup}
          hasSelection={selectedLayers.length > 0}
          onGroup={() => groupSelectedLayers(project.id)}
          onUngroup={() => ungroupSelected(project.id)}
          onDuplicate={() => duplicateSelectedLayers(project.id)}
          onDelete={() => deleteSelectedLayers(project.id)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
