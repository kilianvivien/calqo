import { isGroupLayer } from '@/editor/utils/layers';
import { markerGlyph } from '@/editor/i18n-content/translationPipeline';
import type {
  BackgroundFill,
  CalqoArtboard,
  CalqoLayer,
  ImageLayer,
  ListLayer,
  TextLayer,
} from '@/lib/schema';
import { exportArtboardRaster } from './rasterExport';
import { loadAssetDataUrls, serializeLayer } from './svgExport';
import {
  escapeMarkup,
  fillToCss,
  round,
  rotationToCss,
  shadowToCssDropShadow,
  textStyleToCss,
} from './styleConversions';
import { HTML_EXPORT_WARNINGS, HTML_RASTER_REASONS } from './exportWarnings';

/**
 * Editable HTML/CSS export ("HTML (editable)"): serializes the project
 * document — not the live Konva tree — into a single self-contained HTML file
 * per artboard. Text becomes real, selectable text nodes; shapes become CSS
 * divs or inline SVG; images become `<img>` with data URIs. Layers the web
 * platform can't reproduce fall back to an embedded per-layer PNG with a
 * grouped warning, so fidelity loss is never silent (plan: five-key-features §5).
 */

export interface HtmlLayoutResult {
  html: string;
  warnings: string[];
}

export interface HtmlLayoutOptions {
  title?: string;
  /**
   * Render one top-level layer alone to a PNG data URL sized to the full
   * artboard (so position, rotation, and shadows are baked in). Injectable so
   * unit tests can stub the canvas-dependent raster pipeline.
   */
  rasterizeLayer?: (
    layer: CalqoLayer,
    artboard: CalqoArtboard,
  ) => Promise<string | null>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

/** Default per-layer rasterizer: the existing raster pipeline scoped to a
 * single layer on a transparent artboard-sized canvas. */
async function defaultRasterizeLayer(
  layer: CalqoLayer,
  artboard: CalqoArtboard,
): Promise<string | null> {
  try {
    const blob = await exportArtboardRaster({
      artboard: { ...artboard, layers: [layer] },
      locale: '',
      format: 'png',
      pixelRatio: 2,
      transparent: true,
    });
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/** Why a layer needs the rasterized fallback, or null when it exports natively. */
export function rasterReasonForLayer(layer: CalqoLayer): string | null {
  if (isGroupLayer(layer)) {
    return layer.children.some((child) => rasterReasonForLayer(child) !== null)
      ? HTML_RASTER_REASONS.group
      : null;
  }
  if (layer.sticker) return HTML_RASTER_REASONS.sticker;
  if (layer.type === 'image') {
    if (layer.crop) return HTML_RASTER_REASONS.crop;
    if (layer.frame) return HTML_RASTER_REASONS.frame;
    if (layer.filters) return HTML_RASTER_REASONS.filters;
    if (
      layer.mask &&
      layer.mask.shape !== 'rounded' &&
      layer.mask.shape !== 'circle' &&
      layer.mask.shape !== 'ellipse'
    ) {
      return HTML_RASTER_REASONS.mask;
    }
    return null;
  }
  if (layer.type === 'shape') {
    if (layer.shape === 'freehand') return HTML_RASTER_REASONS.freehand;
    if (layer.fill.type === 'pattern') return HTML_RASTER_REASONS.patternFill;
    if (layer.fill.type === 'image') return HTML_RASTER_REASONS.imageFill;
    return null;
  }
  if (layer.type === 'list' && layer.marker.kind === 'asset') {
    return HTML_RASTER_REASONS.markerAsset;
  }
  return null;
}

function boxCss(layer: CalqoLayer): string {
  return `position:absolute;left:${round(layer.x)}px;top:${round(layer.y)}px;width:${round(layer.w)}px;height:${round(layer.h)}px;`;
}

function commonEffectsCss(layer: CalqoLayer, warnings: string[]): string {
  let css = rotationToCss(layer);
  if (layer.opacity !== 1) css += `opacity:${round(layer.opacity)};`;
  if (layer.blendMode && layer.blendMode !== 'normal') {
    // multiply / screen / overlay all have exact CSS keywords.
    css += `mix-blend-mode:${layer.blendMode};`;
  }
  const filters: string[] = [];
  if (layer.effects?.shadow) {
    filters.push(shadowToCssDropShadow(layer.effects.shadow));
    warnings.push(HTML_EXPORT_WARNINGS.shadow);
  }
  if (layer.effects?.blur) {
    filters.push(`blur(${round(layer.effects.blur)}px)`);
    warnings.push(HTML_EXPORT_WARNINGS.blur);
  }
  if (filters.length > 0) css += `filter:${filters.join(' ')};`;
  return css;
}

function textLayerHtml(layer: TextLayer, locale: string, warnings: string[]): string {
  const value = layer.text[locale] ?? Object.values(layer.text)[0] ?? '';
  const vAlign = layer.style.verticalAlign ?? 'top';
  const align =
    vAlign === 'middle' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start';
  const css =
    boxCss(layer) +
    commonEffectsCss(layer, warnings) +
    textStyleToCss(layer.style) +
    `display:flex;flex-direction:column;justify-content:${align};white-space:pre-wrap;overflow-wrap:break-word;overflow:hidden;`;
  return `<p data-layer="${escapeMarkup(layer.name)}" style="${css}">${escapeMarkup(value)}</p>`;
}

function listLayerHtml(layer: ListLayer, locale: string, warnings: string[]): string {
  const vAlign = layer.style.verticalAlign ?? 'top';
  const align =
    vAlign === 'middle' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start';
  const css =
    boxCss(layer) +
    commonEffectsCss(layer, warnings) +
    textStyleToCss(layer.style) +
    `display:flex;flex-direction:column;justify-content:${align};overflow:hidden;margin:0;padding:0;list-style:none;`;
  const glyph = layer.marker.kind === 'none' ? '' : markerGlyph(layer.marker);
  const markerSize = layer.marker.size ?? layer.style.fontSize;
  const rows = layer.items
    .map((row) => {
      const value = row.text[locale] ?? Object.values(row.text)[0] ?? '';
      const marker = glyph
        ? `<span style="color:${layer.marker.color};font-size:${round(markerSize)}px;margin-right:${round(layer.markerGap)}px;flex:none">${escapeMarkup(glyph)}</span>`
        : '';
      return `<li style="display:flex;align-items:baseline">${marker}<span style="white-space:pre-wrap;overflow-wrap:break-word">${escapeMarkup(value)}</span></li>`;
    })
    .join('');
  return `<ul data-layer="${escapeMarkup(layer.name)}" style="${css}">${rows}</ul>`;
}

function imageLayerHtml(
  layer: ImageLayer,
  assets: Map<string, string>,
  warnings: string[],
): string {
  const dataUrl = assets.get(layer.assetId);
  if (!dataUrl) {
    warnings.push(`Missing asset for layer "${layer.name}" was skipped.`);
    return '';
  }
  const fit =
    layer.fit === 'contain' ? 'contain' : layer.fit === 'stretch' ? 'fill' : 'cover';
  let css =
    boxCss(layer) +
    commonEffectsCss(layer, warnings) +
    `object-fit:${fit};display:block;`;
  if (layer.focalPoint) {
    css += `object-position:${round(layer.focalPoint.x * 100)}% ${round(layer.focalPoint.y * 100)}%;`;
  }
  if (layer.mask?.shape === 'rounded') {
    css += `border-radius:${round(layer.mask.radius ?? 0)}px;`;
  } else if (layer.mask?.shape === 'ellipse') {
    css += 'border-radius:50%;';
  } else if (layer.mask?.shape === 'circle') {
    css += `clip-path:circle(${round(Math.min(layer.w, layer.h) / 2)}px at 50% 50%);`;
  }
  return `<img data-layer="${escapeMarkup(layer.name)}" alt="${escapeMarkup(layer.name)}" src="${dataUrl}" style="${css}" />`;
}

/** Shapes and SVG layers keep their exact geometry by embedding the shared SVG
 * serializer's markup inside a positioned inline `<svg>`. The wrapper spans the
 * container so the layer's own translate/rotate transform stays untouched. */
function inlineSvgLayerHtml(
  layer: CalqoLayer,
  containerW: number,
  containerH: number,
  assets: Map<string, string>,
  locale: string,
  warnings: string[],
): string {
  const markup = serializeLayer(layer, assets, locale, warnings);
  if (!markup) return '';
  return `<svg data-layer="${escapeMarkup(layer.name)}" xmlns="http://www.w3.org/2000/svg" width="${round(containerW)}" height="${round(containerH)}" viewBox="0 0 ${round(containerW)} ${round(containerH)}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none">${markup}</svg>`;
}

/** Whether a shape layer converts to a plain CSS div (solid/gradient rect or
 * ellipse without a stroke); anything else vector-shaped goes to inline SVG. */
function shapeIsCssNative(layer: CalqoLayer): boolean {
  if (layer.type !== 'shape') return false;
  if (layer.shape !== 'rect' && layer.shape !== 'ellipse') return false;
  if (layer.stroke && layer.stroke.width > 0) return false;
  return fillToCss(layer.fill) !== null;
}

function shapeDivHtml(
  layer: Extract<CalqoLayer, { type: 'shape' }>,
  warnings: string[],
): string {
  const background = fillToCss(layer.fill) ?? 'transparent';
  let css =
    boxCss(layer) + commonEffectsCss(layer, warnings) + `background:${background};`;
  if (layer.shape === 'ellipse') css += 'border-radius:50%;';
  else if (layer.cornerRadius) css += `border-radius:${round(layer.cornerRadius)}px;`;
  return `<div data-layer="${escapeMarkup(layer.name)}" style="${css}"></div>`;
}

async function layerHtml(
  layer: CalqoLayer,
  context: {
    artboard: CalqoArtboard;
    assets: Map<string, string>;
    locale: string;
    warnings: string[];
    rasterizeLayer: NonNullable<HtmlLayoutOptions['rasterizeLayer']>;
    containerW: number;
    containerH: number;
    topLevel: boolean;
  },
): Promise<string> {
  if (!layer.visible) return '';
  const { artboard, assets, locale, warnings } = context;

  const reason = rasterReasonForLayer(layer);
  if (reason) {
    // Rasterized fallback is only positionable at the top level (nested layers
    // are group-relative); groups with raster-needing children rasterize whole.
    if (!context.topLevel) return '';
    const dataUrl = await context.rasterizeLayer(layer, artboard);
    if (!dataUrl) {
      warnings.push(`Layer "${layer.name}" could not be rendered and was skipped.`);
      return '';
    }
    warnings.push(HTML_EXPORT_WARNINGS.rasterized(layer.name, reason));
    return `<img data-layer="${escapeMarkup(layer.name)}" data-rasterized="${escapeMarkup(reason)}" alt="${escapeMarkup(layer.name)}" src="${dataUrl}" style="position:absolute;left:0;top:0;width:${round(artboard.width)}px;height:${round(artboard.height)}px;display:block" />`;
  }

  if (isGroupLayer(layer)) {
    const children = await Promise.all(
      layer.children.map((child) =>
        layerHtml(child, {
          ...context,
          containerW: layer.w,
          containerH: layer.h,
          topLevel: false,
        }),
      ),
    );
    const css = boxCss(layer) + commonEffectsCss(layer, warnings);
    return `<div data-layer="${escapeMarkup(layer.name)}" style="${css}">${children.join('')}</div>`;
  }

  if (layer.type === 'text') return textLayerHtml(layer, locale, warnings);
  if (layer.type === 'list') return listLayerHtml(layer, locale, warnings);
  if (layer.type === 'image') return imageLayerHtml(layer, assets, warnings);
  if (layer.type === 'shape' && shapeIsCssNative(layer)) {
    return shapeDivHtml(layer, warnings);
  }
  // Remaining vector content (lines, polygons, arrows, stroked rects/ellipses,
  // svg layers) keeps exact geometry as inline SVG.
  return inlineSvgLayerHtml(
    layer,
    context.containerW,
    context.containerH,
    assets,
    locale,
    warnings,
  );
}

function backgroundHtml(
  background: BackgroundFill,
  assets: Map<string, string>,
): { css: string; node: string } {
  if (background.type === 'image') {
    const dataUrl = assets.get(background.assetId);
    const fit =
      background.fit === 'contain'
        ? 'contain'
        : background.fit === 'stretch'
          ? 'fill'
          : 'cover';
    const node = dataUrl
      ? `<img alt="" src="${dataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};display:block" />`
      : '';
    return { css: 'background:#FFFFFF;', node };
  }
  return { css: `background:${fillToCss(background) ?? '#FFFFFF'};`, node: '' };
}

/** Collect asset ids the background references so they resolve too. */
async function loadAllAssets(artboard: CalqoArtboard): Promise<Map<string, string>> {
  const assets = await loadAssetDataUrls(artboard);
  if (artboard.background.type === 'image' && !assets.has(artboard.background.assetId)) {
    // loadAssetDataUrls only walks layers; fetch the background separately.
    const { assetStorage } = await import('@/lib/adapters');
    const blob = await assetStorage.getAssetBlob(artboard.background.assetId);
    if (blob) assets.set(artboard.background.assetId, await blobToDataUrl(blob));
  }
  return assets;
}

export async function exportArtboardHtmlLayout(
  artboard: CalqoArtboard,
  locale: string,
  options: HtmlLayoutOptions = {},
): Promise<HtmlLayoutResult> {
  const warnings: string[] = [HTML_EXPORT_WARNINGS.fontFallback];
  const assets = await loadAllAssets(artboard);
  const rasterizeLayer = options.rasterizeLayer ?? defaultRasterizeLayer;

  const nodes: string[] = [];
  for (const layer of artboard.layers) {
    nodes.push(
      await layerHtml(layer, {
        artboard,
        assets,
        locale,
        warnings,
        rasterizeLayer,
        containerW: artboard.width,
        containerH: artboard.height,
        topLevel: true,
      }),
    );
  }

  const background = backgroundHtml(artboard.background, assets);
  const unique = [...new Set(warnings)];
  const title = escapeMarkup(options.title ?? artboard.name);
  const notes = unique.map((warning) => `  - ${warning}`).join('\n');

  const html = `<!doctype html>
<html lang="${escapeMarkup(locale || 'en')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <!--
Exported from Calqo as editable HTML.
Fonts are referenced by family name and must be available on the viewing system.
Export notes:
${notes}
    -->
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0c; }
      .calqo-artboard * { margin: 0; box-sizing: border-box; }
    </style>
  </head>
  <body>
    <div class="calqo-artboard" style="position:relative;width:${round(artboard.width)}px;height:${round(artboard.height)}px;overflow:hidden;${background.css}">
${background.node}${nodes.filter(Boolean).join('\n')}
    </div>
  </body>
</html>`;

  return { html, warnings: unique };
}
