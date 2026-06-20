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
import type { Shape } from 'konva/lib/Shape';
import { assetStorage } from '@/lib/adapters';
import { isGroupLayer } from '@/editor/utils/layers';
import { listRowLayout, markerGlyph } from '@/editor/i18n-content/translationPipeline';
import type {
  CalqoArtboard,
  CalqoLayer,
  ListLayer,
  ShapeLayer,
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

function backgroundColor(artboard: CalqoArtboard): string {
  return artboard.background.type === 'solid' ? artboard.background.color : '#FFFFFF';
}

function solidFill(fill: ShapeLayer['fill']): string | undefined {
  return fill.type === 'solid' ? fill.color : '#FFFFFF';
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
  const ids = [...collectAssetIds(artboard.layers)];
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
    return new Text({
      ...base,
      text: layer.text[locale] ?? Object.values(layer.text)[0] ?? '',
      fontFamily: layer.style.fontFamily,
      fontSize: layer.style.fontSize,
      fontStyle: String(layer.style.fontWeight),
      fill: layer.style.color,
      align: layer.style.align,
      verticalAlign: layer.style.verticalAlign,
      lineHeight: layer.style.lineHeight,
      letterSpacing: layer.style.letterSpacing,
      stroke: layer.style.stroke?.color,
      strokeWidth: layer.style.stroke?.width ?? 0,
      shadowColor: layer.style.shadow?.color,
      shadowBlur: layer.style.shadow?.blur,
      shadowOffsetX: layer.style.shadow?.offsetX,
      shadowOffsetY: layer.style.shadow?.offsetY,
      shadowOpacity: layer.style.shadow?.opacity,
    });
  }

  if (layer.type === 'shape') {
    // Line-like shapes share the canvas renderer's defaults.
    const lineColor = layer.stroke?.color ?? '#111827';
    const lineWidth = layer.stroke?.width ?? 4;

    if (layer.shape === 'ellipse') {
      return new Ellipse({
        ...base,
        x: layer.x + layer.w / 2,
        y: layer.y + layer.h / 2,
        radiusX: layer.w / 2,
        radiusY: layer.h / 2,
        fill: solidFill(layer.fill),
        stroke: layer.stroke?.color,
        strokeWidth: layer.stroke?.width ?? 0,
      });
    }
    if (layer.shape === 'arrow') {
      return new Arrow({
        ...base,
        points: layer.points ?? [0, 0, layer.w, layer.h],
        pointerAtBeginning: layer.arrow?.start ?? false,
        pointerAtEnding: layer.arrow?.end ?? true,
        pointerLength: layer.arrow?.pointerLength ?? 16,
        pointerWidth: layer.arrow?.pointerWidth ?? 16,
        fill: lineColor,
        stroke: lineColor,
        strokeWidth: lineWidth,
        lineCap: 'round',
        lineJoin: 'round',
      });
    }
    if (layer.shape === 'freehand') {
      return new Line({
        ...base,
        points: layer.points ?? [0, 0, layer.w, layer.h],
        tension: layer.tension ?? 0.4,
        stroke: lineColor,
        strokeWidth: lineWidth,
        lineCap: layer.stroke?.cap ?? 'round',
        lineJoin: 'round',
      });
    }
    if (layer.shape === 'line' || layer.shape === 'polygon') {
      const isPolygon = layer.shape === 'polygon';
      return new Line({
        ...base,
        points: layer.points ?? [0, 0, layer.w, layer.h],
        closed: isPolygon,
        fill: isPolygon ? solidFill(layer.fill) : undefined,
        stroke: lineColor,
        strokeWidth: lineWidth,
        lineCap: 'round',
        lineJoin: 'round',
      });
    }
    return new Rect({
      ...base,
      fill: solidFill(layer.fill),
      stroke: layer.stroke?.color,
      strokeWidth: layer.stroke?.width ?? 0,
      cornerRadius: layer.cornerRadius ?? 0,
    });
  }

  if (layer.type === 'image' || layer.type === 'svg') {
    const image = images.get(layer.assetId);
    if (!image) return null; // missing asset — skipped (flagged as a warning)
    if (layer.type === 'image' && layer.fit === 'cover') {
      const imageRatio = image.width / image.height;
      const layerRatio = layer.w / layer.h;
      const cropByWidth = imageRatio > layerRatio;
      const cropWidth = cropByWidth ? image.height * layerRatio : image.width;
      const cropHeight = cropByWidth ? image.height : image.width / layerRatio;
      return new KonvaImage({
        ...base,
        image,
        crop: {
          x: (image.width - cropWidth) / 2,
          y: (image.height - cropHeight) / 2,
          width: cropWidth,
          height: cropHeight,
        },
      });
    }
    if (layer.type === 'image' && layer.fit === 'contain') {
      const scale = Math.min(layer.w / image.width, layer.h / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      return new KonvaImage({
        ...base,
        image,
        x: layer.x + (layer.w - width) / 2,
        y: layer.y + (layer.h - height) / 2,
        width,
        height,
      });
    }
    return new KonvaImage({ ...base, image });
  }

  if (layer.type === 'list') {
    return buildListNode(layer, images, locale);
  }

  return null;
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
            fontStyle: String(style.fontWeight),
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
        fontStyle: String(style.fontWeight),
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
    layer.add(
      new Rect({
        x: 0,
        y: 0,
        width: artboard.width,
        height: artboard.height,
        fill: backgroundColor(artboard),
      }),
    );
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
