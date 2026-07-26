import { isGroupLayer } from '@/editor/utils/layers';
import { markerGlyph } from '@/editor/i18n-content/translationPipeline';
import type {
  BackgroundFill,
  CalqoArtboard,
  CalqoLayer,
  CalqoProject,
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
import {
  warningIdentity,
  type HtmlExportWarning,
  type HtmlRasterReason,
} from './exportWarnings';
import { embeddedFontCss } from './portableFonts';
import { compileClipCached } from '@/editor/animation/compiler';
import {
  compileAnimationCss,
  compileFragmentCss,
  type AnimationCssBinding,
  type FragmentCssBinding,
} from './animationCssCompiler';
import type { LayerBox } from '@/editor/animation/wrapperNode';
import type { CompiledFragmentAnimation } from '@/editor/animation/types';
import { createCanvasMeasurer } from '@/editor/animation/textLayout';

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
  warnings: HtmlExportWarning[];
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
    locale: string,
  ) => Promise<string | null>;
  /**
   * Full project — required to compile animation (needs the project id and
   * clip fps for the deterministic compiled-clip cache). When omitted, the
   * export is static regardless of `includeAnimation`.
   */
  project?: CalqoProject;
  /** Emit `@keyframes` and wrapper divs for animated layers (default true when
   * a `project` is supplied). A static project produces identical output either
   * way — the flag only exists so a caller can force a settled static HTML. */
  includeAnimation?: boolean;
  /**
   * `standalone` (default) emits a complete HTML document; `snippet` emits only
   * a scoped `<style>` plus the artboard `<div>`, safe to paste into a host page
   * (keyframe/class names are hash-scoped so they never collide) (AN-3.2).
   */
  mode?: 'standalone' | 'snippet';
}

/** Animation context threaded through {@link layerHtml}: which rendered layers
 * get an animation wrapper, and where downgrade warnings accumulate. */
interface AnimationContext {
  bindings: Map<string, AnimationCssBinding>;
  /** Text-reveal fragment animation + CSS bindings by layer id (AN-3.5). A text
   * layer here is rendered as per-fragment spans instead of one text node. */
  fragments?: Map<string, { anim: CompiledFragmentAnimation; binding: FragmentCssBinding }>;
}

/** Short, stable scope for keyframe/class names, unique per artboard+locale so a
 * multi-artboard/multi-locale batch never collides. */
function animationScope(artboardId: string, locale: string): string {
  let h = 5381;
  const input = `${artboardId}:${locale}`;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Pre-pass mirroring {@link layerHtml}'s render decisions to collect the boxes
 * of layers that will render as their own DOM element AND carry animation, plus
 * `animationDowngrade` warnings for any animated layer baked into a rasterized
 * ancestor (its motion is lost — the ancestor animates only as one unit).
 * `boxes` are in each layer's own (containing-block-local) coordinates, which is
 * exactly what the wrapper's `inset:0` + centre `transform-origin` expects.
 */
function collectAnimation(
  layer: CalqoLayer,
  boxes: Map<string, LayerBox>,
  warnings: HtmlExportWarning[],
  rasterizedAncestor: boolean,
  topLevel: boolean,
): void {
  if (!layer.visible) return;
  const box: LayerBox = { x: layer.x, y: layer.y, w: layer.w, h: layer.h };

  if (rasterizedAncestor) {
    // Baked into an ancestor raster: this layer's own animation cannot survive.
    if (layer.animation) {
      warnings.push({ tier: 'approximated', code: 'animationDowngrade', layerName: layer.name });
    }
    if (isGroupLayer(layer)) {
      layer.children.forEach((c) => collectAnimation(c, boxes, warnings, true, false));
    }
    return;
  }

  const reason = rasterReasonForLayer(layer);
  if (reason) {
    // Rasterizes to a single image. Only positionable (and thus animatable as a
    // unit) at the top level; nested raster-needing layers are not rendered.
    if (!topLevel) return;
    if (layer.animation) boxes.set(layer.id, box);
    if (isGroupLayer(layer)) {
      layer.children.forEach((c) => collectAnimation(c, boxes, warnings, true, false));
    }
    return;
  }

  if (layer.animation) boxes.set(layer.id, box);
  if (isGroupLayer(layer)) {
    layer.children.forEach((c) => collectAnimation(c, boxes, warnings, false, false));
  }
}

/** Wrap a rendered layer's markup in its animation wrapper `<div>` when the
 * layer has a compiled binding; otherwise return the markup untouched. The
 * wrapper spans its containing block (`inset:0`) so the inner element keeps its
 * document geometry and only the wrapper is animated (§4.2 / AN-3.2). */
function wrapAnimated(
  layer: CalqoLayer,
  markup: string,
  anim: AnimationContext | undefined,
): string {
  if (!markup) return markup;
  const binding = anim?.bindings.get(layer.id);
  if (!binding) return markup;
  return `<div class="${binding.wrapperClass}" data-calqo-layer-id="${escapeMarkup(layer.id)}">${markup}</div>`;
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
  locale: string,
): Promise<string | null> {
  try {
    const blob = await exportArtboardRaster({
      artboard: { ...artboard, layers: [layer] },
      locale,
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
export function rasterReasonForLayer(layer: CalqoLayer): HtmlRasterReason | null {
  if (isGroupLayer(layer)) {
    return layer.children.some((child) => rasterReasonForLayer(child) !== null)
      ? 'group'
      : null;
  }
  if (layer.sticker) return 'sticker';
  if (layer.type === 'image') {
    if (layer.crop) return 'crop';
    if (layer.frame) return 'frame';
    if (layer.filters) return 'filters';
    if (layer.backgroundRemoval) return 'backgroundRemoval';
    if (
      layer.mask &&
      layer.mask.shape !== 'rounded' &&
      layer.mask.shape !== 'circle' &&
      layer.mask.shape !== 'ellipse'
    ) {
      return 'mask';
    }
    return null;
  }
  if (layer.type === 'shape') {
    if (layer.shape === 'freehand') return 'freehand';
    if (layer.fill.type === 'pattern') return 'patternFill';
    if (layer.fill.type === 'image') return 'imageFill';
    return null;
  }
  if (layer.type === 'list' && layer.marker.kind === 'asset') {
    return 'markerAsset';
  }
  return null;
}

function boxCss(layer: CalqoLayer): string {
  return `position:absolute;left:${round(layer.x)}px;top:${round(layer.y)}px;width:${round(layer.w)}px;height:${round(layer.h)}px;`;
}

function commonEffectsCss(layer: CalqoLayer, warnings: HtmlExportWarning[]): string {
  let css = rotationToCss(layer);
  if (layer.opacity !== 1) css += `opacity:${round(layer.opacity)};`;
  if (layer.blendMode && layer.blendMode !== 'normal') {
    // multiply / screen / overlay all have exact CSS keywords.
    css += `mix-blend-mode:${layer.blendMode};`;
  }
  const filters: string[] = [];
  if (layer.effects?.shadow) {
    filters.push(shadowToCssDropShadow(layer.effects.shadow));
    warnings.push({ tier: 'approximated', code: 'shadow', layerName: layer.name });
  }
  if (layer.effects?.blur) {
    filters.push(`blur(${round(layer.effects.blur)}px)`);
    warnings.push({ tier: 'approximated', code: 'blur', layerName: layer.name });
  }
  if (filters.length > 0) css += `filter:${filters.join(' ')};`;
  return css;
}

/**
 * Render a text/list layer whose enter slot is a text-reveal preset as
 * absolutely-positioned per-fragment spans, each carrying its fragment animation
 * class (AN-3.5). The container keeps the layer's box and typography; the spans
 * reconstruct the laid-out text from the fragment boxes so the CSS reveal plays
 * per glyph/word. Reduced-motion viewers see every span at identity (its final
 * position/opacity), i.e. the settled text.
 */
function fragmentTextHtml(
  layer: TextLayer | ListLayer,
  fragmentAnim: CompiledFragmentAnimation,
  binding: FragmentCssBinding,
  warnings: HtmlExportWarning[],
): string {
  const containerCss =
    boxCss(layer) +
    commonEffectsCss(layer, warnings) +
    textStyleToCss(layer.style) +
    'overflow:hidden;';
  const spans = fragmentAnim.fragments
    .map((frag, i) => {
      const cls = binding.classes[i];
      const clsAttr = cls ? ` class="${cls}"` : '';
      const spanCss = `position:absolute;left:${round(frag.x)}px;top:${round(frag.y)}px;white-space:pre;display:inline-block;`;
      return `<span${clsAttr} style="${spanCss}">${escapeMarkup(frag.text)}</span>`;
    })
    .join('');
  return `<div data-layer="${escapeMarkup(layer.name)}" data-calqo-fragments="${fragmentAnim.unit}" style="${containerCss}">${spans}</div>`;
}

function textLayerHtml(layer: TextLayer, locale: string, warnings: HtmlExportWarning[]): string {
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

function listLayerHtml(layer: ListLayer, locale: string, warnings: HtmlExportWarning[]): string {
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
  warnings: HtmlExportWarning[],
): string {
  const dataUrl = assets.get(layer.assetId);
  if (!dataUrl) {
    warnings.push({ tier: 'error', code: 'missingAsset', layerName: layer.name });
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
  warnings: HtmlExportWarning[],
): string {
  const svgWarnings: string[] = [];
  const markup = serializeLayer(layer, assets, locale, svgWarnings);
  if (svgWarnings.length > 0) {
    warnings.push({ tier: 'approximated', code: 'vectorApproximation', layerName: layer.name });
  }
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
  warnings: HtmlExportWarning[],
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
    warnings: HtmlExportWarning[];
    rasterizeLayer: NonNullable<HtmlLayoutOptions['rasterizeLayer']>;
    containerW: number;
    containerH: number;
    topLevel: boolean;
    anim?: AnimationContext;
  },
): Promise<string> {
  if (!layer.visible) return '';
  const { artboard, assets, locale, warnings } = context;

  const reason = rasterReasonForLayer(layer);
  if (reason) {
    // Rasterized fallback is only positionable at the top level (nested layers
    // are group-relative); groups with raster-needing children rasterize whole.
    if (!context.topLevel) return '';
    const dataUrl = await context.rasterizeLayer(layer, artboard, locale);
    if (!dataUrl) {
      warnings.push({ tier: 'error', code: 'renderFailed', layerName: layer.name, reason });
      return '';
    }
    warnings.push({ tier: 'rasterized', code: 'rasterized', layerName: layer.name, reason });
    return `<img data-layer="${escapeMarkup(layer.name)}" data-rasterized="${escapeMarkup(reason)}" alt="${escapeMarkup(layer.name)}" src="${dataUrl}" style="position:absolute;left:0;top:0;width:${round(artboard.width)}px;height:${round(artboard.height)}px;display:block" />`;
  }

  if (isGroupLayer(layer)) {
    const children = await Promise.all(
      layer.children.map(async (child) =>
        wrapAnimated(
          child,
          await layerHtml(child, {
            ...context,
            containerW: layer.w,
            containerH: layer.h,
            topLevel: false,
          }),
          context.anim,
        ),
      ),
    );
    const css = boxCss(layer) + commonEffectsCss(layer, warnings);
    return `<div data-layer="${escapeMarkup(layer.name)}" style="${css}">${children.join('')}</div>`;
  }

  const fragment = context.anim?.fragments?.get(layer.id);
  if (fragment && (layer.type === 'text' || layer.type === 'list')) {
    return fragmentTextHtml(layer, fragment.anim, fragment.binding, warnings);
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

export function analyzeHtmlFidelity(artboards: CalqoArtboard[]): HtmlExportWarning[] {
  const warnings: HtmlExportWarning[] = [{ tier: 'caveat', code: 'fontFallback' }];
  const visit = (layer: CalqoLayer) => {
    if (!layer.visible) return;
    const reason = rasterReasonForLayer(layer);
    if (reason) {
      warnings.push({ tier: 'rasterized', code: 'rasterized', layerName: layer.name, reason });
      return;
    }
    if (layer.effects?.shadow) warnings.push({ tier: 'approximated', code: 'shadow', layerName: layer.name });
    if (layer.effects?.blur) warnings.push({ tier: 'approximated', code: 'blur', layerName: layer.name });
    if (isGroupLayer(layer)) layer.children.forEach(visit);
  };
  artboards.forEach((artboard) => artboard.layers.forEach(visit));
  return [...new Map(warnings.map((warning) => [warningIdentity(warning), warning])).values()];
}

export async function exportArtboardHtmlLayout(
  artboard: CalqoArtboard,
  locale: string,
  options: HtmlLayoutOptions = {},
): Promise<HtmlLayoutResult> {
  const warnings: HtmlExportWarning[] = [{ tier: 'caveat', code: 'fontFallback' }];
  const [assets, fontCss] = await Promise.all([
    loadAllAssets(artboard),
    embeddedFontCss(artboard),
  ]);
  const rasterizeLayer = options.rasterizeLayer ?? defaultRasterizeLayer;

  // Compile animation (AN-3.1/3.2). Only layers rendered as their own DOM
  // element and carrying animation get a wrapper; children lost to a rasterized
  // ancestor emit an `animationDowngrade` warning instead.
  const includeAnimation = options.includeAnimation ?? true;
  let anim: AnimationContext | undefined;
  let animCss = '';
  if (options.project && includeAnimation) {
    const boxes = new Map<string, LayerBox>();
    for (const layer of artboard.layers) {
      collectAnimation(layer, boxes, warnings, false, true);
    }
    if (boxes.size > 0) {
      const fps = options.project.clipSettings?.fps ?? 30;
      const sceneDurationMs = artboard.timing?.duration ?? 5000;
      const scopeId = animationScope(artboard.id, locale);
      const { clip } = compileClipCached({
        projectId: options.project.id,
        artboard,
        locale,
        fps,
        // A canvas measurer lets the fragment compiler run when the feature flag
        // is on; gated off in production, this is a no-op (no fragments emitted).
        measurerFor: (font) => createCanvasMeasurer(font),
      });
      const compiled = compileAnimationCss({
        clip,
        boxes,
        sceneDurationMs,
        scopeId,
      });
      animCss = compiled.css;
      if (compiled.bindings.size > 0) anim = { bindings: compiled.bindings };

      // Text-reveal fragments (AN-3.5): one @keyframes per fragment plus a
      // per-fragment binding used to render spans. Present only when a text
      // layer carries an enabled reveal preset.
      const fragmentCss = compileFragmentCss(clip.fragments, fps, sceneDurationMs, scopeId);
      if (fragmentCss.bindings.size > 0 && clip.fragments) {
        animCss = [animCss, fragmentCss.css].filter(Boolean).join('\n');
        const fragMap = new Map<
          string,
          { anim: CompiledFragmentAnimation; binding: FragmentCssBinding }
        >();
        for (const fa of clip.fragments) {
          const binding = fragmentCss.bindings.get(fa.layerId);
          if (binding) fragMap.set(fa.layerId, { anim: fa, binding });
        }
        anim = { bindings: anim?.bindings ?? new Map(), fragments: fragMap };
      }
    }
  }

  const nodes: string[] = [];
  for (const layer of artboard.layers) {
    nodes.push(
      wrapAnimated(
        layer,
        await layerHtml(layer, {
          artboard,
          assets,
          locale,
          warnings,
          rasterizeLayer,
          containerW: artboard.width,
          containerH: artboard.height,
          topLevel: true,
          anim,
        }),
        anim,
      ),
    );
  }

  const background = backgroundHtml(artboard.background, assets);
  const unique = [...new Map(warnings.map((warning) => [warningIdentity(warning), warning])).values()];
  const title = escapeMarkup(options.title ?? artboard.name);
  const notes = unique.map((warning) => `  - ${warning.tier}:${warning.code}${warning.reason ? `:${warning.reason}` : ''}${warning.layerName ? ` (${warning.layerName})` : ''}`).join('\n');
  const fontNote = fontCss
    ? 'Web font files used by this artboard are embedded in this document.'
    : 'Fonts are referenced by family name and must be available on the viewing system.';

  const artboardDiv = `<div class="calqo-artboard" data-calqo-artboard-id="${escapeMarkup(artboard.id)}" style="position:relative;width:${round(artboard.width)}px;height:${round(artboard.height)}px;overflow:hidden;${background.css}">
${background.node}${nodes.filter(Boolean).join('\n')}
    </div>`;

  // Snippet mode: only a scoped <style> plus the artboard div. Keyframe/class
  // names are hash-scoped so pasting into a host page cannot collide (AN-3.2).
  if (options.mode === 'snippet') {
    const styleInner = [fontCss, '.calqo-artboard * { margin: 0; box-sizing: border-box; }', animCss]
      .filter(Boolean)
      .join('\n      ');
    const snippet = `<style>
      ${styleInner}
    </style>
    ${artboardDiv}`;
    return { html: snippet, warnings: unique };
  }

  const html = `<!doctype html>
<html lang="${escapeMarkup(locale || 'en')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <!--
Exported from Calqo as editable HTML.
${fontNote}
Export notes:
${notes}
    -->
    <style>
      ${fontCss}
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0c; }
      .calqo-artboard * { margin: 0; box-sizing: border-box; }
      ${animCss}
    </style>
  </head>
  <body>
    ${artboardDiv}
  </body>
</html>`;

  return { html, warnings: unique };
}
