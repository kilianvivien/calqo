import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as KonvaImage, Layer, Line, Rect, Stage } from 'react-konva';
import { useTranslation } from 'react-i18next';
import { Check, RotateCcw, X } from 'lucide-react';
import { updateLayerInActiveArtboard } from '@/editor/commands/projectCommands';
import type { CalqoProject, ImageLayer } from '@/lib/schema';
import { useAssetImage } from '@/editor/canvas/useAssetImage';
import {
  clampCropView,
  initCropView,
  resizeCropFrame,
  viewToCropRect,
  zoomCropView,
  type CropFrame,
  type CropHandle,
  type CropView,
} from '@/editor/canvas/cropGeometry';
import { cn } from '@/lib/utils/cn';

interface MobileCropOverlayProps {
  project: CalqoProject;
  layer: ImageLayer;
  onClose: () => void;
}

interface AspectPreset {
  id: string;
  /** Width / height; null means keep the layer's current aspect ("free"). */
  ratio: number | null;
}

const PRESETS: AspectPreset[] = [
  { id: 'free', ratio: null },
  { id: '1:1', ratio: 1 },
  { id: '4:5', ratio: 4 / 5 },
  { id: '3:4', ratio: 3 / 4 },
  { id: '16:9', ratio: 16 / 9 },
  { id: '9:16', ratio: 9 / 16 },
];

const FRAME_PADDING = 24;
/** Half-length of a drawn corner bracket / edge bar. */
const HANDLE_LEN = 18;
/** Touch radius for grabbing a frame handle. */
const HANDLE_HIT = 32;

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** The eight handle anchor points of a frame, in container coordinates. */
function handlePoints(frame: CropFrame): [CropHandle, number, number][] {
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

/** Nearest handle within {@link HANDLE_HIT} of a container-space point, if any. */
function handleAt(px: number, py: number, frame: CropFrame): CropHandle | null {
  let best: CropHandle | null = null;
  let bestDist = HANDLE_HIT;
  for (const [handle, hx, hy] of handlePoints(frame)) {
    const dist = Math.hypot(px - hx, py - hy);
    if (dist <= bestDist) {
      bestDist = dist;
      best = handle;
    }
  }
  return best;
}

/** Full-screen touch crop & reframe editor. Pan with one finger, pinch to zoom,
 * pick an aspect-ratio preset; committing writes an image-pixel crop rect (and,
 * for a non-free aspect, a matching layer height) back to the schema. Reuses the
 * pure {@link CropView} maths shared with the desktop crop tool. */
export function MobileCropOverlay({ project, layer, onClose }: MobileCropOverlayProps) {
  const { t } = useTranslation('editor');
  const containerRef = useRef<HTMLDivElement>(null);
  const { image, missing } = useAssetImage(layer.assetId);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [presetId, setPresetId] = useState('free');
  const [view, setView] = useState<CropView | null>(null);
  // A hand-resized frame in free mode; null falls back to the aspect-fit frame.
  const [freeFrame, setFreeFrame] = useState<CropFrame | null>(null);
  const viewRef = useRef<CropView | null>(null);
  viewRef.current = view;
  const didInit = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const aspect =
    PRESETS.find((preset) => preset.id === presetId)?.ratio ?? layer.w / layer.h;

  // The aspect-fit frame for the current preset; the starting point a free crop
  // is reshaped from. Re-fitting the view keys off this, not the live frame, so
  // dragging a handle never resets the user's pan/zoom.
  const baseFrame: CropFrame | null = useMemo(() => {
    const availW = size.width - FRAME_PADDING * 2;
    const availH = size.height - FRAME_PADDING * 2;
    if (availW <= 0 || availH <= 0) return null;
    let fw = availW;
    let fh = fw / aspect;
    if (fh > availH) {
      fh = availH;
      fw = fh * aspect;
    }
    return { x: (size.width - fw) / 2, y: (size.height - fh) / 2, w: fw, h: fh };
  }, [size, aspect]);

  const frame = presetId === 'free' && freeFrame ? freeFrame : baseFrame;
  const frameRef = useRef<CropFrame | null>(null);
  frameRef.current = frame;
  const presetRef = useRef(presetId);
  presetRef.current = presetId;

  // Initialise (and re-fit) the crop view: honour the layer's saved crop the
  // first time the free preset mounts, otherwise centre at cover scale.
  useEffect(() => {
    if (!baseFrame || !image) return;
    const seedCrop = !didInit.current && presetId === 'free' ? layer.crop : undefined;
    setView(initCropView(image.width, image.height, baseFrame, seedCrop));
    didInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFrame, image, presetId]);

  // Native touch gestures: grab a frame handle to reshape the crop (free mode),
  // otherwise one finger pans and two fingers pinch-zoom. Frame/view/preset are
  // read from refs so a handle drag — which mutates the frame every move —
  // doesn't tear down and re-attach these listeners mid-gesture.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !image) return undefined;
    const iw = image.width;
    const ih = image.height;
    let mode: 'pan' | 'pinch' | 'resize' | null = null;
    let handle: CropHandle | null = null;
    let start = { x: 0, y: 0, dist: 0, view: viewRef.current, frame: frameRef.current };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        const f = frameRef.current;
        const rect = el.getBoundingClientRect();
        const px = event.touches[0].clientX - rect.left;
        const py = event.touches[0].clientY - rect.top;
        handle = presetRef.current === 'free' && f ? handleAt(px, py, f) : null;
        mode = handle ? 'resize' : 'pan';
        start = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          dist: 0,
          view: viewRef.current,
          frame: f,
        };
      } else if (event.touches.length >= 2) {
        mode = 'pinch';
        handle = null;
        start = {
          x: 0,
          y: 0,
          dist: touchDistance(event.touches[0], event.touches[1]),
          view: viewRef.current,
          frame: frameRef.current,
        };
      }
      event.preventDefault();
    };

    const onMove = (event: TouchEvent) => {
      if (!mode || !start.view) return;
      event.preventDefault();
      const f = frameRef.current;
      if (mode === 'resize' && handle && start.frame && event.touches.length === 1) {
        const dx = event.touches[0].clientX - start.x;
        const dy = event.touches[0].clientY - start.y;
        const bounds: CropFrame = {
          x: FRAME_PADDING,
          y: FRAME_PADDING,
          w: el.clientWidth - FRAME_PADDING * 2,
          h: el.clientHeight - FRAME_PADDING * 2,
        };
        const next = resizeCropFrame(start.frame, handle, dx, dy, bounds);
        setFreeFrame(next);
        setView(clampCropView(start.view, iw, ih, next));
      } else if (mode === 'pan' && f && event.touches.length === 1) {
        const dx = event.touches[0].clientX - start.x;
        const dy = event.touches[0].clientY - start.y;
        setView(
          clampCropView(
            { scale: start.view.scale, x: start.view.x + dx, y: start.view.y + dy },
            iw,
            ih,
            f,
          ),
        );
      } else if (mode === 'pinch' && f && event.touches.length >= 2 && start.dist > 0) {
        const factor = touchDistance(event.touches[0], event.touches[1]) / start.dist;
        setView(zoomCropView(start.view, f, factor, iw, ih));
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        mode = null;
        handle = null;
      } else if (event.touches.length === 1) {
        mode = 'pan';
        handle = null;
        start = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          dist: 0,
          view: viewRef.current,
          frame: frameRef.current,
        };
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
  }, [image]);

  const commit = () => {
    if (frame && image && view) {
      const crop = viewToCropRect(view, frame, image.width, image.height);
      const ratio = frame.w / frame.h;
      updateLayerInActiveArtboard(project.id, layer.id, { crop, h: layer.w / ratio });
    }
    onClose();
  };

  const reset = () => {
    updateLayerInActiveArtboard(project.id, layer.id, { crop: null, focalPoint: null });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-[rgba(8,9,12,0.96)] pt-[max(env(safe-area-inset-top),8px)] pb-[max(env(safe-area-inset-bottom),12px)]">
      <header className="flex shrink-0 items-center justify-between px-3 py-2">
        <button
          type="button"
          aria-label={t('crop.cancel')}
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition-colors active:bg-white/10"
        >
          <X size={20} />
        </button>
        <span className="text-[14px] font-semibold text-white">{t('mobile.crop.title')}</span>
        <button
          type="button"
          aria-label={t('crop.apply')}
          onClick={commit}
          className="grid h-10 w-10 place-items-center rounded-full text-[var(--calqo-accent)] transition-colors active:bg-white/10"
        >
          <Check size={22} />
        </button>
      </header>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        {image && view && frame && size.width > 0 ? (
          <Stage width={size.width} height={size.height} listening={false}>
            <Layer listening={false}>
              <KonvaImage
                image={image}
                x={view.x}
                y={view.y}
                width={image.width * view.scale}
                height={image.height * view.scale}
              />
              <Rect x={0} y={0} width={size.width} height={frame.y} fill="rgba(0,0,0,0.6)" />
              <Rect x={0} y={frame.y} width={frame.x} height={frame.h} fill="rgba(0,0,0,0.6)" />
              <Rect
                x={frame.x + frame.w}
                y={frame.y}
                width={Math.max(0, size.width - frame.x - frame.w)}
                height={frame.h}
                fill="rgba(0,0,0,0.6)"
              />
              <Rect
                x={0}
                y={frame.y + frame.h}
                width={size.width}
                height={Math.max(0, size.height - frame.y - frame.h)}
                fill="rgba(0,0,0,0.6)"
              />
              <Rect
                x={frame.x}
                y={frame.y}
                width={frame.w}
                height={frame.h}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              {[1, 2].map((i) => (
                <Line
                  key={`v${i}`}
                  points={[frame.x + (frame.w * i) / 3, frame.y, frame.x + (frame.w * i) / 3, frame.y + frame.h]}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1}
                />
              ))}
              {[1, 2].map((i) => (
                <Line
                  key={`h${i}`}
                  points={[frame.x, frame.y + (frame.h * i) / 3, frame.x + frame.w, frame.y + (frame.h * i) / 3]}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1}
                />
              ))}
              {presetId === 'free' && (
                <>
                  {/* Corner brackets — grab to reshape the crop freely. */}
                  <Line
                    points={[frame.x, frame.y + HANDLE_LEN, frame.x, frame.y, frame.x + HANDLE_LEN, frame.y]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                    lineJoin="round"
                  />
                  <Line
                    points={[frame.x + frame.w - HANDLE_LEN, frame.y, frame.x + frame.w, frame.y, frame.x + frame.w, frame.y + HANDLE_LEN]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                    lineJoin="round"
                  />
                  <Line
                    points={[frame.x + frame.w, frame.y + frame.h - HANDLE_LEN, frame.x + frame.w, frame.y + frame.h, frame.x + frame.w - HANDLE_LEN, frame.y + frame.h]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                    lineJoin="round"
                  />
                  <Line
                    points={[frame.x + HANDLE_LEN, frame.y + frame.h, frame.x, frame.y + frame.h, frame.x, frame.y + frame.h - HANDLE_LEN]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                    lineJoin="round"
                  />
                  {/* Edge bars — drag a side to change the crop ratio. */}
                  <Line
                    points={[frame.x + frame.w / 2 - HANDLE_LEN, frame.y, frame.x + frame.w / 2 + HANDLE_LEN, frame.y]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                  />
                  <Line
                    points={[frame.x + frame.w / 2 - HANDLE_LEN, frame.y + frame.h, frame.x + frame.w / 2 + HANDLE_LEN, frame.y + frame.h]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                  />
                  <Line
                    points={[frame.x, frame.y + frame.h / 2 - HANDLE_LEN, frame.x, frame.y + frame.h / 2 + HANDLE_LEN]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                  />
                  <Line
                    points={[frame.x + frame.w, frame.y + frame.h / 2 - HANDLE_LEN, frame.x + frame.w, frame.y + frame.h / 2 + HANDLE_LEN]}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    lineCap="round"
                  />
                </>
              )}
            </Layer>
          </Stage>
        ) : (
          <div className="grid h-full place-items-center text-[13px] text-white/60">
            {missing ? t('canvas.missingAsset') : t('canvas.loadingAsset')}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pt-2">
        <div className="calqo-scroll mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setPresetId(preset.id);
                setFreeFrame(null);
              }}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors active:scale-[0.97]',
                preset.id === presetId
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent)] text-white'
                  : 'border-white/20 text-white/80',
              )}
            >
              {preset.id === 'free' ? t('mobile.crop.free') : preset.id}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--calqo-radius-sm)] border border-white/15 text-[13px] font-medium text-white/80 transition-colors active:bg-white/10"
        >
          <RotateCcw size={15} />
          {t('mobile.crop.reset')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
