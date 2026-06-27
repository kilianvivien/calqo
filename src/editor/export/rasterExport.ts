// Import from Konva's browser-safe modules rather than the package root, which
// pulls the Node `canvas` build (breaks jsdom/tests).
import { Stage } from 'konva/lib/Stage';
import { Layer } from 'konva/lib/Layer';
import { Group } from 'konva/lib/Group';
import { Rect } from 'konva/lib/shapes/Rect';
import { Text } from 'konva/lib/shapes/Text';
import { Image as KonvaImage } from 'konva/lib/shapes/Image';
import { Ellipse } from 'konva/lib/shapes/Ellipse';
import { Line } from 'konva/lib/shapes/Line';
import { Arrow } from 'konva/lib/shapes/Arrow';
import { Circle } from 'konva/lib/shapes/Circle';
import type { Shape } from 'konva/lib/Shape';
import type { ShapeConfig } from 'konva/lib/Shape';
import type { Context } from 'konva/lib/Context';
import { assetStorage } from '@/lib/adapters';
import { isGroupLayer } from '@/editor/utils/layers';
import { listRowLayout, markerGlyph } from '@/editor/i18n-content/translationPipeline';
import { fillProps, imageFillProps } from '@/editor/canvas/shapeStyle';
import { strokeLookConfig } from '@/editor/canvas/strokeStyle';
import { stickerStrokeConfig } from '@/editor/canvas/stickerOutline';
import { frameRender, type FrameNodeSpec } from '@/editor/canvas/frameNodes';
import { drawMaskPath } from '@/editor/canvas/maskClip';
import { coverCropRect, fitImageConfig } from '@/editor/canvas/imageFilters';
import type {
  CalqoArtboard,
  CalqoLayer,
  ImageLayer,
  ListLayer,
  ShapeLayer,
  ArrowStyle,
} from '@/lib/schema';

export type RasterFormat = 'png' | 'jpeg' | 'webp';

export interface RasterExportOptions {
  artboard: CalqoArtboard;
  /** Active content locale, for rendering text variants. */
  locale: string;
  format: RasterFormat;
  pixelRatio: 1 | 2 | 3;
  /** Omit the background fill (PNG/WebP only — JPEG always gets a fill). */
  transparent: boolean;
  /** 0–1, used for JPEG/WebP. */
  quality?: number;
}

const MIME: Record<RasterFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Konva fill config for a shape fill, honouring gradients, patterns, and image
 * fills (image fills need the asset to have loaded). Mirrors the live renderer. */
function shapeFillConfig(
  fill: ShapeLayer['fill'],
  w: number,
  h: number,
  centered: boolean,
  images: Map<string, HTMLImageElement>,
): ShapeConfig {
  if (fill.type === 'image') {
    const image = images.get(fill.assetId);
    return image ? imageFillProps(image, fill.fit, w, h, centered) : { fill: '#FFFFFF' };
  }
  return fillProps(fill, w, h, centered);
}

/** Asset ids referenced by image/svg layers anywhere in the tree. */
function collectAssetIds(layers: CalqoLayer[], into = new Set<string>()): Set<string> {
  for (const layer of layers) {
    if (layer.type === 'image' || layer.type === 'svg') into.add(layer.assetId);
    if (layer.type === 'list' && layer.marker.kind === 'asset' && layer.marker.assetId) {
      into.add(layer.marker.assetId);
    }
    if (isGroupLayer(layer)) collectAssetIds(layer.children, into);
  }
  return into;
}

interface LoadedImages {
  images: Map<string, HTMLImageElement>;
  revoke: () => void;
}

async function loadImages(artboard: CalqoArtboard): Promise<LoadedImages> {
  const idSet = collectAssetIds(artboard.layers);
  if (artboard.background.type === 'image') idSet.add(artboard.background.assetId);
  const ids = [...idSet];
  const images = new Map<string, HTMLImageElement>();
  const urls: string[] = [];
  await Promise.all(
    ids.map(async (id) => {
      const blob = await assetStorage.getAssetBlob(id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          images.set(id, image);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = url;
      });
    }),
  );
  return { images, revoke: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}

function commonAttrs(layer: CalqoLayer) {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.w,
    height: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity,
  };
}

/** Drop-shadow attrs from a layer effect (mirrors the live renderer). */
function shadowAttrs(layer: CalqoLayer): ShapeConfig {
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

/** Blend-mode attr (canvas composite op); `normal` is the implicit default. */
function blendAttrs(layer: CalqoLayer): ShapeConfig {
  if (!layer.blendMode || layer.blendMode === 'normal') return {};
  return { globalCompositeOperation: layer.blendMode };
}

/** Build a Konva node for a declarative frame spec (shared geometry with the
 * live renderer's FrameNodesView). */
function buildFrameNode(spec: FrameNodeSpec): Shape {
  const shadow =
    'shadow' in spec && spec.shadow
      ? {
          shadowColor: spec.shadow.color,
          shadowBlur: spec.shadow.blur,
          shadowOffsetX: spec.shadow.offsetX,
          shadowOffsetY: spec.shadow.offsetY,
          shadowOpacity: spec.shadow.opacity ?? 1,
        }
      : {};
  if (spec.kind === 'rect') {
    return new Rect({
      x: spec.x,
      y: spec.y,
      width: spec.w,
      height: spec.h,
      fill: spec.fill,
      stroke: spec.stroke,
      strokeWidth: spec.strokeWidth,
      cornerRadius: spec.cornerRadius,
      ...shadow,
    });
  }
  if (spec.kind === 'ellipse') {
    return new Ellipse({
      x: spec.x + spec.w / 2,
      y: spec.y + spec.h / 2,
      radiusX: spec.w / 2,
      radiusY: spec.h / 2,
      stroke: spec.stroke,
      strokeWidth: spec.strokeWidth,
      ...shadow,
    });
  }
  return new Text({
    x: spec.x,
    y: spec.y,
    width: spec.w,
    height: spec.h,
    text: spec.text,
    fill: spec.color,
    fontSize: spec.fontSize,
    fontFamily: 'Inter',
    align: 'center',
    verticalAlign: 'middle',
  });
}

function arrowTip(points: number[], atStart: boolean): { x: number; y: number; radians: number } | null {
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

function arrowHeadShapes(points: number[], arrow: ArrowStyle | undefined, color: string, width: number): Shape[] {
  const style = arrow?.headStyle ?? 'triangle';
  if (style === 'triangle') return [];
  const length = arrow?.pointerLength ?? 16;
  const headWidth = arrow?.pointerWidth ?? 16;
  const heads: Shape[] = [];
  const addHead = (atStart: boolean) => {
    const tip = arrowTip(points, atStart);
    if (!tip) return;
    const cos = Math.cos(tip.radians);
    const sin = Math.sin(tip.radians);
    const point = (forward: number, side: number) => ({
      x: tip.x + forward * cos - side * sin,
      y: tip.y + forward * sin + side * cos,
    });
    if (style === 'chevron') {
      const a = point(-length, headWidth / 2);
      const b = point(-length, -headWidth / 2);
      heads.push(
        new Line({
          points: [a.x, a.y, tip.x, tip.y, b.x, b.y],
          stroke: color,
          strokeWidth: width,
          lineCap: 'round',
          lineJoin: 'round',
        }),
      );
      return;
    }
    if (style === 'bar') {
      const a = point(0, headWidth / 2);
      const b = point(0, -headWidth / 2);
      heads.push(
        new Line({
          points: [a.x, a.y, b.x, b.y],
          stroke: color,
          strokeWidth: Math.max(width, 2),
          lineCap: 'round',
        }),
      );
      return;
    }
    if (style === 'dot') {
      heads.push(new Circle({ x: tip.x, y: tip.y, radius: Math.max(headWidth / 2, width), fill: color }));
    }
  };
  if (arrow?.start ?? false) addHead(true);
  if (arrow?.end ?? true) addHead(false);
  return heads;
}

/** Build the Konva node for a layer, mirroring the on-canvas LayerRenderer. */
function buildNode(
  layer: CalqoLayer,
  images: Map<string, HTMLImageElement>,
  locale: string,
): Group | Shape | null {
  if (!layer.visible) return null;
  const base = commonAttrs(layer);

  if (isGroupLayer(layer)) {
    const group = new Group(base);
    layer.children.forEach((child) => {
      const node = buildNode(child, images, locale);
      if (node) group.add(node);
    });
    return group;
  }

  if (layer.type === 'text') {
    const typeProps = {
      text: layer.text[locale] ?? Object.values(layer.text)[0] ?? '',
      fontFamily: layer.style.fontFamily,
      fontSize: layer.style.fontSize,
      fontStyle: layer.style.fontStyle,
      textDecoration: layer.style.textDecoration,
      fontWeight: layer.style.fontWeight,
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
    if (!layer.sticker) {
      return new Text({ ...base, ...blendAttrs(layer), ...typeProps, fill: layer.style.color, ...ownStroke, ...shadow });
    }
    const group = new Group({ ...base, ...blendAttrs(layer) });
    group.add(
      new Text({
        width: layer.w,
        height: layer.h,
        ...typeProps,
        fill: layer.sticker.color,
        ...stickerStrokeConfig(layer.sticker),
      }),
    );
    group.add(
      new Text({ width: layer.w, height: layer.h, ...typeProps, fill: layer.style.color, ...ownStroke, ...shadow }),
    );
    return group;
  }

  if (layer.type === 'shape') {
    // Line-like shapes share the canvas renderer's defaults.
    const lineColor = layer.stroke?.color ?? '#111827';
    const lineWidth = layer.stroke?.width ?? 4;
    const points = layer.points ?? [0, 0, layer.w, layer.h];
    const isPolygon = layer.shape === 'polygon';

    /** Build the shape body at origin (ox, oy) with the given fill/stroke. `nb`
     * is the node base (full attrs for a standalone node, size-only when nested
     * in a sticker decoration group). */
    const mkBody = (
      ox: number,
      oy: number,
      fillCfg: ShapeConfig,
      strokeCfg: ShapeConfig,
      nb: ShapeConfig,
    ): Group | Shape => {
      const sColor = (strokeCfg.stroke as string) ?? lineColor;
      const sWidth = (strokeCfg.strokeWidth as number) ?? lineWidth;
      const cap = (strokeCfg.lineCap as 'butt' | 'round' | 'square' | undefined) ?? layer.stroke?.cap ?? 'round';
      const join = (strokeCfg.lineJoin as 'miter' | 'round' | 'bevel' | undefined) ?? layer.stroke?.join ?? 'round';
      if (layer.shape === 'ellipse') {
        return new Ellipse({
          ...nb,
          ...fillCfg,
          ...strokeCfg,
          x: ox + layer.w / 2,
          y: oy + layer.h / 2,
          radiusX: layer.w / 2,
          radiusY: layer.h / 2,
        });
      }
      if (layer.shape === 'arrow') {
        if ((layer.arrow?.headStyle ?? 'triangle') !== 'triangle') {
          const group = new Group({ ...nb, x: ox, y: oy });
          group.add(
            new Line({
              ...strokeCfg,
              points,
              stroke: sColor,
              strokeWidth: sWidth,
              lineCap: cap,
              lineJoin: join,
            }),
          );
          arrowHeadShapes(points, layer.arrow, sColor, sWidth).forEach((head) => group.add(head));
          return group;
        }
        return new Arrow({
          ...nb,
          ...strokeCfg,
          x: ox,
          y: oy,
          points,
          pointerAtBeginning: layer.arrow?.start ?? false,
          pointerAtEnding: layer.arrow?.end ?? true,
          pointerLength: layer.arrow?.pointerLength ?? 16,
          pointerWidth: layer.arrow?.pointerWidth ?? 16,
          fill: sColor,
          stroke: sColor,
          strokeWidth: sWidth,
          lineCap: cap,
          lineJoin: join,
        });
      }
      if (layer.shape === 'freehand') {
        return new Line({
          ...nb,
          ...strokeCfg,
          x: ox,
          y: oy,
          points,
          tension: layer.tension ?? 0.4,
          stroke: sColor,
          strokeWidth: sWidth,
          lineCap: cap,
          lineJoin: join,
        });
      }
      if (layer.shape === 'line' || isPolygon) {
        return new Line({
          ...nb,
          ...(isPolygon ? fillCfg : {}),
          ...strokeCfg,
          x: ox,
          y: oy,
          points,
          closed: isPolygon,
          stroke: sColor,
          strokeWidth: sWidth,
          lineCap: cap,
          lineJoin: join,
        });
      }
      return new Rect({
        ...nb,
        ...fillCfg,
        ...strokeCfg,
        x: ox,
        y: oy,
        cornerRadius: layer.cornerRadius ?? 0,
      });
    };

    const primaryFill = shapeFillConfig(layer.fill, layer.w, layer.h, layer.shape === 'ellipse', images);
    const primaryStroke = strokeLookConfig(layer.stroke);
    const effects = { ...shadowAttrs(layer), ...blendAttrs(layer) };

    if (!layer.sticker) {
      return mkBody(layer.x, layer.y, primaryFill, primaryStroke, { ...base, ...effects });
    }

    const group = new Group({ ...base, ...effects });
    const sizeOnly = { width: layer.w, height: layer.h };
    group.add(
      mkBody(0, 0, { fill: layer.sticker.color }, stickerStrokeConfig(layer.sticker, lineWidth), sizeOnly),
    );
    group.add(mkBody(0, 0, primaryFill, primaryStroke, sizeOnly));
    return group;
  }

  if (layer.type === 'svg') {
    const image = images.get(layer.assetId);
    if (!image) return null; // missing asset — skipped (flagged as a warning)
    const effects = { ...shadowAttrs(layer), ...blendAttrs(layer) };
    if (!layer.sticker) return new KonvaImage({ ...base, ...effects, image });
    const group = new Group({ ...base, ...blendAttrs(layer) });
    group.add(stickerHaloRect(layer.sticker, layer.w, layer.h));
    group.add(new KonvaImage({ width: layer.w, height: layer.h, ...shadowAttrs(layer), image }));
    return group;
  }

  if (layer.type === 'image') {
    return buildImageNode(layer, images, locale);
  }

  if (layer.type === 'list') {
    return buildListNode(layer, images, locale);
  }

  return null;
}

/** A rounded sticker halo rect, sized to wrap a layer's box (mirrors the live
 * renderer's image/svg sticker approximation). */
function stickerHaloRect(sticker: NonNullable<CalqoLayer['sticker']>, w: number, h: number): Rect {
  return new Rect({
    x: -sticker.width,
    y: -sticker.width,
    width: w + sticker.width * 2,
    height: h + sticker.width * 2,
    fill: sticker.color,
    cornerRadius: sticker.width,
    ...(sticker.shadow
      ? {
          shadowColor: sticker.shadow.color,
          shadowBlur: sticker.shadow.blur,
          shadowOffsetX: sticker.shadow.offsetX,
          shadowOffsetY: sticker.shadow.offsetY,
          shadowOpacity: sticker.shadow.opacity ?? 1,
        }
      : {}),
  });
}

/** Build an image layer node, honouring frame, sticker, mask, and crop/fit —
 * mirrors the live ImageLayerNode. */
function buildImageNode(
  layer: ImageLayer,
  images: Map<string, HTMLImageElement>,
  locale: string,
): Group | Shape | null {
  const image = images.get(layer.assetId);
  if (!image) return null; // missing asset — skipped (flagged as a warning)

  const caption = layer.frame?.caption?.[locale] ?? Object.values(layer.frame?.caption ?? {})[0] ?? '';
  const frame = layer.frame ? frameRender(layer.frame, layer.w, layer.h, caption) : null;
  const inset = frame?.inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const cw = Math.max(1, layer.w - inset.left - inset.right);
  const ch = Math.max(1, layer.h - inset.top - inset.bottom);

  // Image config in content-local coordinates (origin at the content box).
  let imgCfg: ConstructorParameters<typeof KonvaImage>[0];
  if (layer.crop) {
    imgCfg = {
      image,
      x: 0,
      y: 0,
      width: cw,
      height: ch,
      crop: { x: layer.crop.x, y: layer.crop.y, width: layer.crop.w, height: layer.crop.h },
    };
  } else if (layer.fit === 'cover') {
    imgCfg = {
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
    imgCfg = { image, x: (cw - width) / 2, y: (ch - height) / 2, width, height };
  } else {
    imgCfg = { image, x: 0, y: 0, width: cw, height: ch };
  }

  const base = commonAttrs(layer);
  const effects = { ...shadowAttrs(layer), ...blendAttrs(layer) };
  const clipFunc = layer.mask
    ? (ctx: Context) => drawMaskPath(ctx as unknown as CanvasRenderingContext2D, layer.mask!, cw, ch)
    : undefined;

  // Fast path: no frame, no sticker, no mask — a single positioned Image.
  if (!frame && !layer.sticker && !clipFunc) {
    return new KonvaImage({
      ...imgCfg,
      x: layer.x + (imgCfg.x ?? 0),
      y: layer.y + (imgCfg.y ?? 0),
      rotation: layer.rotation,
      opacity: layer.opacity,
      ...effects,
    });
  }

  const group = new Group({ ...base, ...effects });
  if (layer.sticker) group.add(stickerHaloRect(layer.sticker, layer.w, layer.h));
  frame?.behind.forEach((spec) => group.add(buildFrameNode(spec)));
  const inner = new Group({ x: inset.left, y: inset.top, ...(clipFunc ? { clipFunc } : {}) });
  inner.add(new KonvaImage(imgCfg));
  group.add(inner);
  frame?.front.forEach((spec) => group.add(buildFrameNode(spec)));
  return group;
}

/** Build a list layer as a clipped Konva group of marker + row text nodes,
 * mirroring the on-canvas ListLayerNode. */
function buildListNode(
  layer: ListLayer,
  images: Map<string, HTMLImageElement>,
  locale: string,
): Group | null {
  const style = layer.style;
  const { rowHeights, markerWidth, rowTextWidth, totalHeight } = listRowLayout(layer, locale);
  const markerSize = layer.marker.size ?? style.fontSize;
  const lineHeightPx = style.fontSize * style.lineHeight;
  const vAlign = style.verticalAlign ?? 'top';
  let startY = 0;
  if (vAlign === 'middle') startY = Math.max(0, (layer.h - totalHeight) / 2);
  else if (vAlign === 'bottom') startY = Math.max(0, layer.h - totalHeight);

  const group = new Group({
    ...commonAttrs(layer),
    clipX: 0,
    clipY: 0,
    clipWidth: layer.w,
    clipHeight: layer.h,
  });

  const markerImage =
    layer.marker.kind === 'asset' && layer.marker.assetId
      ? images.get(layer.marker.assetId) ?? null
      : null;

  let cursorY = startY;
  layer.items.forEach((row) => {
    const rowHeight = rowHeights.shift() ?? lineHeightPx;
    const value = row.text[locale] ?? Object.values(row.text)[0] ?? '';
    const rowY = cursorY;
    cursorY += rowHeight;

    if (layer.marker.kind !== 'none') {
      if (markerImage) {
        const imgY = rowY + Math.max(0, (lineHeightPx - markerSize) / 2);
        group.add(
          new KonvaImage({
            image: markerImage,
            x: 0,
            y: imgY,
            width: markerSize,
            height: markerSize,
          }),
        );
      } else if (layer.marker.kind !== 'asset') {
        group.add(
          new Text({
            x: 0,
            y: rowY,
            width: markerWidth,
            height: rowHeight,
            text: markerGlyph(layer.marker),
            fontFamily: style.fontFamily,
            fontSize: markerSize,
            fontStyle: style.fontStyle,
            textDecoration: style.textDecoration,
            fontWeight: style.fontWeight,
            fill: layer.marker.color,
            align: 'left',
            verticalAlign: 'top',
            lineHeight: style.lineHeight,
          }),
        );
      }
    }

    group.add(
      new Text({
        x: markerWidth + layer.markerGap,
        y: rowY,
        width: rowTextWidth,
        height: rowHeight,
        text: value,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontStyle: style.fontStyle,
        textDecoration: style.textDecoration,
        fontWeight: style.fontWeight,
        fill: style.color,
        align: style.align,
        verticalAlign: 'top',
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        stroke: style.stroke?.color,
        strokeWidth: style.stroke?.width ?? 0,
        shadowColor: style.shadow?.color,
        shadowBlur: style.shadow?.blur,
        shadowOffsetX: style.shadow?.offsetX,
        shadowOffsetY: style.shadow?.offsetY,
        shadowOpacity: style.shadow?.opacity,
      }),
    );
  });
  return group;
}

/** Render an artboard to a raster blob via a detached offscreen Konva stage. */
export async function exportArtboardRaster(
  options: RasterExportOptions,
): Promise<Blob> {
  const { artboard, locale, format, pixelRatio, transparent, quality } = options;
  const { images, revoke } = await loadImages(artboard);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-100000px';
  container.style.top = '0';
  document.body.appendChild(container);

  const stage = new Stage({
    container,
    width: artboard.width,
    height: artboard.height,
  });
  const layer = new Layer();
  stage.add(layer);

  // JPEG cannot be transparent, so it always gets a background fill.
  const paintBackground = !transparent || format === 'jpeg';
  if (paintBackground) {
    const bg = artboard.background;
    const bgImage = bg.type === 'image' ? images.get(bg.assetId) : undefined;
    layer.add(
      new Rect({
        x: 0,
        y: 0,
        width: artboard.width,
        height: artboard.height,
        ...(bg.type === 'image'
          ? { fill: '#FFFFFF' }
          : fillProps(bg, artboard.width, artboard.height)),
      }),
    );
    if (bgImage && bg.type === 'image') {
      const clip = new Group({
        clipX: 0,
        clipY: 0,
        clipWidth: artboard.width,
        clipHeight: artboard.height,
      });
      clip.add(new KonvaImage(fitImageConfig(bgImage, bg.fit, artboard.width, artboard.height)));
      layer.add(clip);
    }
  }

  // Clip content to the artboard bounds so nothing spills past the frame.
  const content = new Group({
    clipX: 0,
    clipY: 0,
    clipWidth: artboard.width,
    clipHeight: artboard.height,
  });
  artboard.layers.forEach((l) => {
    const node = buildNode(l, images, locale);
    if (node) content.add(node);
  });
  layer.add(content);
  layer.draw();

  try {
    return (await stage.toBlob({
      mimeType: MIME[format],
      pixelRatio,
      quality: quality ?? 0.92,
    })) as Blob;
  } finally {
    stage.destroy();
    container.remove();
    revoke();
  }
}

/** Build a download filename for an artboard export. */
export function rasterFilename(
  projectName: string,
  artboardName: string,
  format: RasterFormat,
  pixelRatio: number,
): string {
  const slug = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'calqo';
  const scale = pixelRatio > 1 ? `@${pixelRatio}x` : '';
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `${slug(projectName)}-${slug(artboardName)}${scale}.${ext}`;
}
