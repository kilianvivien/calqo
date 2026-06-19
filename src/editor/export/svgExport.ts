// Browser-safe Konva Text shape, used purely to reproduce Konva's own line
// wrapping / height clipping so SVG text matches the canvas render.
import { Text } from 'konva/lib/shapes/Text';
import { assetStorage } from '@/lib/adapters';
import { isGroupLayer } from '@/editor/utils/layers';
import type { CalqoArtboard, CalqoLayer, ShapeLayer, TextLayer } from '@/lib/schema';

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
  warnings.push('Gradient and image fills are exported as a flat colour.');
  return '#CCCCCC';
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

function serializeLayer(
  layer: CalqoLayer,
  assets: Map<string, string>,
  locale: string,
  warnings: string[],
): string {
  if (!layer.visible) return '';
  const opacity = layer.opacity !== 1 ? ` opacity="${layer.opacity}"` : '';
  if (layer.effects?.shadow || layer.effects?.blur) {
    warnings.push('Shadows and blur are not included in SVG export.');
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
    const stroke = layer.stroke
      ? ` stroke="${layer.stroke.color}" stroke-width="${layer.stroke.width}"`
      : '';
    if (layer.shape === 'ellipse') {
      return `${open}<ellipse cx="${layer.w / 2}" cy="${layer.h / 2}" rx="${layer.w / 2}" ry="${layer.h / 2}" fill="${solidFill(layer.fill, warnings)}"${stroke} />${close}`;
    }
    if (layer.shape === 'line' || layer.shape === 'polygon') {
      const pts = layer.points ?? [0, 0, layer.w, layer.h];
      const pairs: string[] = [];
      for (let i = 0; i < pts.length; i += 2) pairs.push(`${pts[i]},${pts[i + 1]}`);
      const tag = layer.shape === 'polygon' ? 'polygon' : 'polyline';
      const fill = layer.shape === 'polygon' ? solidFill(layer.fill, warnings) : 'none';
      const strokeColor = layer.stroke?.color ?? solidFill(layer.fill, warnings);
      const strokeWidth = layer.stroke?.width ?? 4;
      return `${open}<${tag} points="${pairs.join(' ')}" fill="${fill}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />${close}`;
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
      warnings.push('Image masks are not applied in SVG export.');
    }
    if (layer.type === 'image' && layer.filters) {
      warnings.push('Image filters (brightness, contrast, saturation, blur) are not applied in SVG export.');
    }
    const aspect =
      layer.type === 'image' && layer.fit === 'contain'
        ? 'xMidYMid meet'
        : layer.type === 'image' && layer.fit === 'stretch'
          ? 'none'
          : 'xMidYMid slice';
    return `${open}<image href="${dataUrl}" x="0" y="0" width="${layer.w}" height="${layer.h}" preserveAspectRatio="${aspect}" />${close}`;
  }

  return '';
}

async function loadAssetDataUrls(artboard: CalqoArtboard): Promise<Map<string, string>> {
  const ids = new Set<string>();
  const collect = (layers: CalqoLayer[]) => {
    for (const layer of layers) {
      if (layer.type === 'image' || layer.type === 'svg') ids.add(layer.assetId);
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
