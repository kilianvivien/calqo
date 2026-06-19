// Konva's browser-safe Text module (avoids the Node `canvas` build in jsdom).
import { Text } from 'konva/lib/shapes/Text';
import type {
  CalqoArtboard,
  CalqoLayer,
  CalqoProject,
  LocaleCode,
  TextLayer,
  TextOverflowState,
} from '@/lib/schema';
import { isGroupLayer } from '@/editor/utils/layers';
import type { TranslationItem } from '@/editor/ai/AIProvider';

export type TranslationScope = 'active' | 'all';

function collectTextLayers(layers: CalqoLayer[], into: TextLayer[]): void {
  for (const layer of layers) {
    if (layer.type === 'text') into.push(layer);
    else if (isGroupLayer(layer)) collectTextLayers(layer.children, into);
  }
}

/** Gather translatable text items from one or all artboards (plan §13.3).
 * Layers with no source-locale text (after fallback) are skipped. */
export function extractTranslationItems(
  project: CalqoProject,
  sourceLocale: LocaleCode,
  scope: TranslationScope,
  activeArtboardId: string | null,
): TranslationItem[] {
  const artboards: CalqoArtboard[] =
    scope === 'all'
      ? project.artboards
      : project.artboards.filter(
          (ab) => ab.id === (activeArtboardId ?? project.artboards[0]?.id),
        );

  const items: TranslationItem[] = [];
  for (const artboard of artboards) {
    const textLayers: TextLayer[] = [];
    collectTextLayers(artboard.layers, textLayers);
    for (const layer of textLayers) {
      const sourceText =
        layer.text[sourceLocale] ?? Object.values(layer.text)[0] ?? '';
      if (!sourceText.trim()) continue;
      items.push({
        layerId: layer.id,
        artboardId: artboard.id,
        sourceText,
        context: layer.name,
      });
    }
  }
  return items;
}

const OVERFLOW_TOLERANCE = 1; // px slack before we call it overflow

/** Derive an overflow state from measured text dimensions (pure, unit-testable).
 * Returns undefined when the text fits its box. */
export function overflowStateFromMeasurement(
  layer: TextLayer,
  measured: { width: number; height: number },
  locale: LocaleCode,
): TextOverflowState | undefined {
  const overHeight = measured.height > layer.h + OVERFLOW_TOLERANCE;
  const overWidth = measured.width > layer.w + OVERFLOW_TOLERANCE;
  if (!overHeight && !overWidth) return undefined;
  return {
    hasOverflow: true,
    measuredAtLocale: locale,
    suggestedAction: overHeight ? 'reduce-font' : 'increase-box',
  };
}

/** Measure a text layer's rendered size for a given string using an offscreen
 * Konva node. Returns null when measurement isn't possible (e.g. jsdom without
 * a real canvas) so callers can skip overflow detection gracefully. */
export function measureText(
  layer: TextLayer,
  value: string,
): { width: number; height: number } | null {
  try {
    const node = new Text({
      text: value,
      width: layer.w,
      fontFamily: layer.style.fontFamily,
      fontSize: layer.style.fontSize,
      fontStyle: String(layer.style.fontWeight),
      lineHeight: layer.style.lineHeight,
      letterSpacing: layer.style.letterSpacing,
      align: layer.style.align,
    });
    const height = node.height();
    const width = node.getTextWidth();
    node.destroy();
    if (!Number.isFinite(height) || height <= 0) return null;
    return { width, height };
  } catch {
    return null;
  }
}

/** Compute the overflow state for a text layer at a locale, or undefined when it
 * fits / can't be measured (plan §13.6). */
export function detectTextOverflow(
  layer: TextLayer,
  locale: LocaleCode,
): TextOverflowState | undefined {
  const value = layer.text[locale];
  if (!value || !value.trim()) return undefined;
  const measured = measureText(layer, value);
  if (!measured) return undefined;
  return overflowStateFromMeasurement(layer, measured, locale);
}
