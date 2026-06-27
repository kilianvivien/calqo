// Browser-safe Konva Text shape, used purely to reproduce Konva's own line
// wrapping / height clipping so SVG text matches the canvas render.
import { Text } from 'konva/lib/shapes/Text';
import { assetStorage } from '@/lib/adapters';
import { isGroupLayer } from '@/editor/utils/layers';
import { listRowLayout, markerGlyph } from '@/editor/i18n-content/translationPipeline';
import { strokeProps } from '@/editor/canvas/shapeStyle';
import { strokeLookNeedsRasterWarning } from '@/editor/canvas/strokeStyle';
import { frameRender, type FrameNodeSpec } from '@/editor/canvas/frameNodes';
import { EXPORT_WARNINGS } from './exportWarnings';
import type { ArrowStyle, CalqoArtboard, CalqoLayer, ListLayer, ShapeLayer, StrokeStyle, TextLayer } from '@/lib/schema';

interface TextLine {
  text: string;
  width: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reproduce Konva.Text's wrapped, height-clipped lines so the SVG output keeps
 * the same line breaks and visible text as the on-canvas/raster render. */
function layoutText(layer: TextLayer, value: string): { lines: TextLine[]; lineHeightPx: number } {
  const style = layer.style;
  const lineHeightPx = style.fontSize * style.lineHeight;
  try {
    const node = new Text({
      text: value,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: String(style.fontWeight),
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      align: style.align,
      width: layer.w,
      height: layer.h,
      padding: 0,
      wrap: 'word',
    });
    const arr = (node as unknown as { textArr?: TextLine[] }).textArr;
    node.destroy();
    if (arr && arr.length > 0) {
      return { lines: arr.map((l) => ({ text: l.text, width: l.width })), lineHeightPx };
    }
  } catch {
    /* jsdom/no-canvas — fall back to naive newline splitting */
  }
  return { lines: value.split('\n').map((text) => ({ text, width: 0 })), lineHeightPx };
}

/** Limited SVG serializer (plan §12.5). Supports rectangles, ellipses,
 * lines/polygons, basic text, solid fills, simple strokes, opacity, rotation,
 * groups, and embedded raster images. Gradients, blur, shadows, and image
 * filters are approximated/omitted and surfaced as warnings. */

export interface SvgExportResult {
  svg: string;
  warnings: string[];
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function solidFill(fill: ShapeLayer['fill'], warnings: string[]): string {
  if (fill.type === 'solid') return fill.color;
  warnings.push(EXPORT_WARNINGS.gradientFill);
  return '#CCCCCC';
}

/** SVG stroke attributes for a Calqo stroke, expanding named dash styles / look
 * dash arrays and the line join. Raster-only looks are flagged separately. */
function strokeAttrs(stroke: StrokeStyle | undefined): string {
  if (!stroke || stroke.width <= 0) return '';
  const cfg = strokeProps(stroke);
  let out = ` stroke="${stroke.color}" stroke-width="${stroke.width}"`;
  if (Array.isArray(cfg.dash) && cfg.dash.length > 0) out += ` stroke-dasharray="${cfg.dash.join(' ')}"`;
  if (stroke.join) out += ` stroke-linejoin="${stroke.join}"`;
  if (stroke.cap) out += ` stroke-linecap="${stroke.cap}"`;
  return out;
}

/** `stroke-dasharray` attribute for a stroke's named/custom dash, or ''. */
function dashAttr(stroke: StrokeStyle | undefined): string {
  if (!stroke) return '';
  const cfg = strokeProps(stroke);
  return Array.isArray(cfg.dash) && cfg.dash.length > 0 ? ` stroke-dasharray="${cfg.dash.join(' ')}"` : '';
}

/** Render frame node specs as SVG elements (image frames). */
function frameSvg(specs: FrameNodeSpec[]): string {
  return specs
    .map((spec) => {
      if (spec.kind === 'rect') {
        const fill = spec.fill ? ` fill="${spec.fill}"` : ' fill="none"';
        const stroke = spec.stroke ? ` stroke="${spec.stroke}" stroke-width="${spec.strokeWidth ?? 1}"` : '';
        const radius = spec.cornerRadius ? ` rx="${spec.cornerRadius}"` : '';
        return `<rect x="${round(spec.x)}" y="${round(spec.y)}" width="${round(spec.w)}" height="${round(spec.h)}"${radius}${fill}${stroke} />`;
      }
      if (spec.kind === 'ellipse') {
        return `<ellipse cx="${round(spec.x + spec.w / 2)}" cy="${round(spec.y + spec.h / 2)}" rx="${round(spec.w / 2)}" ry="${round(spec.h / 2)}" fill="none" stroke="${spec.stroke}" stroke-width="${spec.strokeWidth}" />`;
      }
      return `<text x="${round(spec.x + spec.w / 2)}" y="${round(spec.y + spec.h / 2)}" font-family="Inter" font-size="${spec.fontSize}" fill="${spec.color}" text-anchor="middle" dominant-baseline="central">${esc(spec.text)}</text>`;
    })
    .join('');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

function transform(layer: CalqoLayer): string {
  const parts = [`translate(${layer.x} ${layer.y})`];
  if (layer.rotation) parts.push(`rotate(${layer.rotation})`);
  return parts.join(' ');
}

// --- Cardinal-spline helpers, mirroring konva/lib/shapes/Line so freehand and
// tensioned strokes export with the same curvature the canvas draws. ---

function controlPoints(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number,
): [number, number, number, number] {
  const d01 = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
  const d12 = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const fa = (t * d01) / (d01 + d12);
  const fb = (t * d12) / (d01 + d12);
  return [x1 - fa * (x2 - x0), y1 - fa * (y2 - y0), x1 + fb * (x2 - x0), y1 + fb * (y2 - y0)];
}

function expandTensionPoints(p: number[], tension: number): number[] {
  const out: number[] = [];
  for (let n = 2; n < p.length - 2; n += 2) {
    const cp = controlPoints(p[n - 2], p[n - 1], p[n], p[n + 1], p[n + 2], p[n + 3], tension);
    if (Number.isNaN(cp[0])) continue;
    out.push(cp[0], cp[1], p[n], p[n + 1], cp[2], cp[3]);
  }
  return out;
}

/** Build an SVG path `d` for a (optionally tensioned) open polyline, matching
 * Konva.Line's `_sceneFunc`. */
function strokePathData(points: number[], tension: number): string {
  const length = points.length;
  if (length < 2) return '';
  let d = `M ${round(points[0])} ${round(points[1])}`;
  if (tension !== 0 && length > 4) {
    const tp = expandTensionPoints(points, tension);
    d += ` Q ${round(tp[0])} ${round(tp[1])} ${round(tp[2])} ${round(tp[3])}`;
    let n = 4;
    while (n < tp.length - 2) {
      d += ` C ${round(tp[n++])} ${round(tp[n++])} ${round(tp[n++])} ${round(tp[n++])} ${round(tp[n++])} ${round(tp[n++])}`;
    }
    d += ` Q ${round(tp[tp.length - 2])} ${round(tp[tp.length - 1])} ${round(points[length - 2])} ${round(points[length - 1])}`;
  } else {
    for (let n = 2; n < length; n += 2) d += ` L ${round(points[n])} ${round(points[n + 1])}`;
  }
  return d;
}

/** The three corners of a Konva arrowhead triangle at a tip, pointing along
 * `radians`. */
function arrowHeadPoints(
  tipX: number, tipY: number, radians: number, length: number, width: number,
): string {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corner = (lx: number, ly: number): string =>
    `${round(tipX + lx * cos - ly * sin)},${round(tipY + lx * sin + ly * cos)}`;
  return `${corner(0, 0)} ${corner(-length, width / 2)} ${corner(-length, -width / 2)}`;
}

function arrowHeadSvg(
  tipX: number,
  tipY: number,
  radians: number,
  length: number,
  width: number,
  lineColor: string,
  lineWidth: number,
  style: NonNullable<ArrowStyle['headStyle']>,
): string {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const point = (forward: number, side: number): string =>
    `${round(tipX + forward * cos - side * sin)},${round(tipY + forward * sin + side * cos)}`;
  if (style === 'chevron') {
    return `<polyline points="${point(-length, width / 2)} ${point(0, 0)} ${point(-length, -width / 2)}" fill="none" stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
  }
  if (style === 'bar') {
    return `<line x1="${round(tipX + (width / 2) * -sin)}" y1="${round(tipY + (width / 2) * cos)}" x2="${round(tipX - (width / 2) * -sin)}" y2="${round(tipY - (width / 2) * cos)}" stroke="${lineColor}" stroke-width="${Math.max(lineWidth, 2)}" stroke-linecap="round" />`;
  }
  if (style === 'dot') {
    return `<circle cx="${round(tipX)}" cy="${round(tipY)}" r="${round(Math.max(width / 2, lineWidth))}" fill="${lineColor}" />`;
  }
  return `<polygon points="${arrowHeadPoints(tipX, tipY, radians, length, width)}" fill="${lineColor}" stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linejoin="round" />`;
}

function serializeLayer(
  layer: CalqoLayer,
  assets: Map<string, string>,
  locale: string,
  warnings: string[],
): string {
  if (!layer.visible) return '';
  const opacity = layer.opacity !== 1 ? ` opacity="${layer.opacity}"` : '';
  if (layer.effects?.shadow || layer.effects?.blur) {
    warnings.push(EXPORT_WARNINGS.shadowBlur);
  }
  if (layer.sticker) {
    warnings.push(EXPORT_WARNINGS.stickerOutline);
  }
  const open = `<g transform="${transform(layer)}"${opacity}>`;
  const close = '</g>';

  if (isGroupLayer(layer)) {
    const children = layer.children
      .map((child) => serializeLayer(child, assets, locale, warnings))
      .join('');
    return `${open}${children}${close}`;
  }

  if (layer.type === 'shape') {
    const stroke = strokeAttrs(layer.stroke);
    if (strokeLookNeedsRasterWarning(layer.stroke)) {
      warnings.push(EXPORT_WARNINGS.strokeLook);
    }
    if (layer.shape === 'ellipse') {
      return `${open}<ellipse cx="${layer.w / 2}" cy="${layer.h / 2}" rx="${layer.w / 2}" ry="${layer.h / 2}" fill="${solidFill(layer.fill, warnings)}"${stroke} />${close}`;
    }
    // Line-like shapes share the canvas renderer's defaults.
    const lineColor = layer.stroke?.color ?? '#111827';
    const lineWidth = layer.stroke?.width ?? 4;
    const lineStroke = strokeProps(layer.stroke);
    const cap = (lineStroke.lineCap as 'butt' | 'round' | 'square' | undefined) ?? layer.stroke?.cap ?? 'round';
    const join = layer.stroke?.join ?? 'round';
    if (layer.shape === 'freehand') {
      const pts = layer.points ?? [0, 0, layer.w, layer.h];
      const d = strokePathData(pts, layer.tension ?? 0.4);
      return `${open}<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="${cap}" stroke-linejoin="${join}"${dashAttr(layer.stroke)} />${close}`;
    }
    if (layer.shape === 'arrow') {
      const pts = layer.points ?? [0, 0, layer.w, layer.h];
      const n = pts.length;
      const headLength = layer.arrow?.pointerLength ?? 16;
      const headWidth = layer.arrow?.pointerWidth ?? 16;
      const headStyle = layer.arrow?.headStyle ?? 'triangle';
      const parts = [
        `<path d="${strokePathData(pts, layer.tension ?? 0)}" fill="none" stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="${cap}" stroke-linejoin="${join}"${dashAttr(layer.stroke)} />`,
      ];
      if ((layer.arrow?.end ?? true) && n >= 4) {
        const radians = Math.atan2(pts[n - 1] - pts[n - 3], pts[n - 2] - pts[n - 4]);
        parts.push(arrowHeadSvg(pts[n - 2], pts[n - 1], radians, headLength, headWidth, lineColor, lineWidth, headStyle));
      }
      if ((layer.arrow?.start ?? false) && n >= 4) {
        const radians = Math.atan2(pts[1] - pts[3], pts[0] - pts[2]);
        parts.push(arrowHeadSvg(pts[0], pts[1], radians, headLength, headWidth, lineColor, lineWidth, headStyle));
      }
      return `${open}${parts.join('')}${close}`;
    }
    if (layer.shape === 'line' || layer.shape === 'polygon') {
      const pts = layer.points ?? [0, 0, layer.w, layer.h];
      const pairs: string[] = [];
      for (let i = 0; i < pts.length; i += 2) pairs.push(`${pts[i]},${pts[i + 1]}`);
      const tag = layer.shape === 'polygon' ? 'polygon' : 'polyline';
      const fill = layer.shape === 'polygon' ? solidFill(layer.fill, warnings) : 'none';
      return `${open}<${tag} points="${pairs.join(' ')}" fill="${fill}" stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="${cap}" stroke-linejoin="${join}"${dashAttr(layer.stroke)} />${close}`;
    }
    const radius = layer.cornerRadius ? ` rx="${layer.cornerRadius}"` : '';
    return `${open}<rect width="${layer.w}" height="${layer.h}"${radius} fill="${solidFill(layer.fill, warnings)}"${stroke} />${close}`;
  }

  if (layer.type === 'text') {
    const style = layer.style;
    const value = layer.text[locale] ?? Object.values(layer.text)[0] ?? '';
    const { lines, lineHeightPx } = layoutText(layer, value);
    // Konva uses textBaseline 'middle'; SVG 'central' is the closest match.
    const vAlign = style.verticalAlign ?? 'top';
    const alignY =
      vAlign === 'middle'
        ? (layer.h - lines.length * lineHeightPx) / 2
        : vAlign === 'bottom'
          ? layer.h - lines.length * lineHeightPx
          : 0;
    const tspans = lines
      .map((line, n) => {
        const x =
          style.align === 'right'
            ? layer.w - line.width
            : style.align === 'center'
              ? (layer.w - line.width) / 2
              : 0;
        const y = alignY + lineHeightPx / 2 + n * lineHeightPx;
        return `<tspan x="${round(x)}" y="${round(y)}">${esc(line.text)}</tspan>`;
      })
      .join('');
    const stroke = style.stroke
      ? ` stroke="${style.stroke.color}" stroke-width="${style.stroke.width}"`
      : '';
    const letterSpacing = style.letterSpacing
      ? ` letter-spacing="${style.letterSpacing}"`
      : '';
    return `${open}<text font-family="${esc(style.fontFamily)}" font-size="${style.fontSize}" font-weight="${style.fontWeight}" fill="${style.color}" dominant-baseline="central" text-anchor="start"${letterSpacing}${stroke}>${tspans}</text>${close}`;
  }

  if (layer.type === 'image' || layer.type === 'svg') {
    const dataUrl = assets.get(layer.assetId);
    if (!dataUrl) {
      warnings.push(`Missing asset for layer "${layer.name}" was skipped.`);
      return '';
    }
    if (layer.type === 'image' && layer.mask) {
      warnings.push(EXPORT_WARNINGS.imageMask);
    }
    if (layer.type === 'image' && layer.filters) {
      warnings.push(EXPORT_WARNINGS.imageFilters);
    }
    const frame = layer.type === 'image' && layer.frame ? frameRender(layer.frame, layer.w, layer.h, layer.frame.caption?.[locale] ?? Object.values(layer.frame.caption ?? {})[0] ?? '') : null;
    if (frame) warnings.push(EXPORT_WARNINGS.imageFrame);
    const inset = frame?.inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const cw = Math.max(1, layer.w - inset.left - inset.right);
    const ch = Math.max(1, layer.h - inset.top - inset.bottom);
    const aspect =
      layer.type === 'image' && layer.fit === 'contain'
        ? 'xMidYMid meet'
        : layer.type === 'image' && layer.fit === 'stretch'
          ? 'none'
          : 'xMidYMid slice';
    const behind = frame ? frameSvg(frame.behind) : '';
    const front = frame ? frameSvg(frame.front) : '';
    const img = `<image href="${dataUrl}" x="${round(inset.left)}" y="${round(inset.top)}" width="${round(cw)}" height="${round(ch)}" preserveAspectRatio="${aspect}" />`;
    return `${open}${behind}${img}${front}${close}`;
  }

  if (layer.type === 'list') {
    return serializeList(layer, assets, locale, warnings, open, close);
  }

  return '';
}

/** Serialize a list layer as a group of per-row text blocks with markers,
 * mirroring the on-canvas ListLayerNode layout. */
function serializeList(
  layer: ListLayer,
  assets: Map<string, string>,
  locale: string,
  warnings: string[],
  open: string,
  close: string,
): string {
  const style = layer.style;
  const { rowHeights, markerWidth, rowTextWidth } = listRowLayout(layer, locale);
  const markerSize = layer.marker.size ?? style.fontSize;
  const lineHeightPx = style.fontSize * style.lineHeight;
  const vAlign = style.verticalAlign ?? 'top';
  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  let startY = 0;
  if (vAlign === 'middle') startY = Math.max(0, (layer.h - totalHeight) / 2);
  else if (vAlign === 'bottom') startY = Math.max(0, layer.h - totalHeight);

  const markerAssetUrl =
    layer.marker.kind === 'asset' && layer.marker.assetId
      ? assets.get(layer.marker.assetId)
      : null;
  if (layer.marker.kind === 'asset' && !markerAssetUrl) {
    warnings.push(`Missing marker asset for list "${layer.name}".`);
  }

  let cursorY = startY;
  const parts: string[] = [];
  layer.items.forEach((row, index) => {
    const rowHeight = rowHeights[index] ?? lineHeightPx;
    const value = row.text[locale] ?? Object.values(row.text)[0] ?? '';
    const rowY = cursorY;
    cursorY += rowHeight;

    if (layer.marker.kind !== 'none') {
      if (markerAssetUrl) {
        const imgY = rowY + Math.max(0, (lineHeightPx - markerSize) / 2);
        parts.push(
          `<image href="${markerAssetUrl}" x="0" y="${round(imgY)}" width="${markerSize}" height="${markerSize}" preserveAspectRatio="xMidYMid meet" />`,
        );
      } else if (layer.marker.kind !== 'asset') {
        parts.push(
          `<text font-family="${esc(style.fontFamily)}" font-size="${markerSize}" font-weight="${style.fontWeight}" fill="${layer.marker.color}" x="0" y="${round(rowY + lineHeightPx / 2)}" dominant-baseline="central">${esc(markerGlyph(layer.marker))}</text>`,
        );
      }
    }

    const synthetic = { style, w: rowTextWidth, h: rowHeight } as unknown as TextLayer;
    const { lines } = layoutText(synthetic, value);
    const tspans = lines
      .map((line, n) => {
        const x =
          style.align === 'right'
            ? markerWidth + layer.markerGap + (rowTextWidth - line.width)
            : style.align === 'center'
              ? markerWidth + layer.markerGap + (rowTextWidth - line.width) / 2
              : markerWidth + layer.markerGap;
        const y = rowY + lineHeightPx / 2 + n * lineHeightPx;
        return `<tspan x="${round(x)}" y="${round(y)}">${esc(line.text)}</tspan>`;
      })
      .join('');
    const stroke = style.stroke
      ? ` stroke="${style.stroke.color}" stroke-width="${style.stroke.width}"`
      : '';
    const letterSpacing = style.letterSpacing ? ` letter-spacing="${style.letterSpacing}"` : '';
    parts.push(
      `<text font-family="${esc(style.fontFamily)}" font-size="${style.fontSize}" font-weight="${style.fontWeight}" fill="${style.color}" dominant-baseline="central" text-anchor="start"${letterSpacing}${stroke}>${tspans}</text>`,
    );
  });
  return `${open}${parts.join('')}${close}`;
}

async function loadAssetDataUrls(artboard: CalqoArtboard): Promise<Map<string, string>> {
  const ids = new Set<string>();
  const collect = (layers: CalqoLayer[]) => {
    for (const layer of layers) {
      if (layer.type === 'image' || layer.type === 'svg') ids.add(layer.assetId);
      if (layer.type === 'list' && layer.marker.kind === 'asset' && layer.marker.assetId) {
        ids.add(layer.marker.assetId);
      }
      if (isGroupLayer(layer)) collect(layer.children);
    }
  };
  collect(artboard.layers);
  const map = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      const blob = await assetStorage.getAssetBlob(id);
      if (blob) map.set(id, await blobToDataUrl(blob));
    }),
  );
  return map;
}

export async function exportArtboardSvg(
  artboard: CalqoArtboard,
  locale: string,
): Promise<SvgExportResult> {
  const warnings: string[] = [];
  const assets = await loadAssetDataUrls(artboard);
  const background =
    artboard.background.type === 'solid' ? artboard.background.color : '#FFFFFF';
  const body = artboard.layers
    .map((layer) => serializeLayer(layer, assets, locale, warnings))
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.width}" height="${artboard.height}" viewBox="0 0 ${artboard.width} ${artboard.height}">
<rect width="${artboard.width}" height="${artboard.height}" fill="${background}" />
${body}
</svg>`;
  return { svg, warnings: [...new Set(warnings)] };
}
