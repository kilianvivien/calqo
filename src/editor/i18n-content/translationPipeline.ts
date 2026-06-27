// Konva's browser-safe Text module (avoids the Node `canvas` build in jsdom).
import { Text } from 'konva/lib/shapes/Text';
import type {
  CalqoArtboard,
  CalqoLayer,
  CalqoProject,
  ListLayer,
  LocaleCode,
  TextLayer,
  TextOverflowState,
  TextStyle,
} from '@/lib/schema';
import { isGroupLayer } from '@/editor/utils/layers';
import type { TranslationItem } from '@/editor/ai/AIProvider';

export type TranslationScope = 'active' | 'all';

/** Separator used to encode a list-row reference into a single translation
 * `layerId` so the row can round-trip through the provider: `${layerId}::${rowId}`. */
export const LIST_ROW_ID_SEP = '::';

export function encodeListRowId(layerId: string, rowId: string): string {
  return `${layerId}${LIST_ROW_ID_SEP}${rowId}`;
}

export function decodeListRowId(
  id: string,
): { layerId: string; rowId: string } | null {
  const idx = id.indexOf(LIST_ROW_ID_SEP);
  if (idx < 0) return null;
  return { layerId: id.slice(0, idx), rowId: id.slice(idx + LIST_ROW_ID_SEP.length) };
}

/** Resolve a per-locale string with the same fallback the renderer uses. */
function resolveLocaleValue(
  text: Record<string, string>,
  locale: LocaleCode,
): string {
  return text[locale] ?? Object.values(text)[0] ?? '';
}

/** Gather translatable text items from one or all artboards (plan §13.3).
 * Layers with no source-locale text (after fallback) are skipped. List layers
 * emit one item per row, keyed by an encoded `layerId::rowId` so each row is
 * translated independently. */
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
  const visit = (layers: CalqoLayer[], artboardId: string) => {
    for (const layer of layers) {
      if (layer.type === 'text') {
        const sourceText = resolveLocaleValue(layer.text, sourceLocale);
        if (!sourceText.trim()) continue;
        items.push({
          layerId: layer.id,
          artboardId,
          sourceText,
          context: layer.name,
        });
      } else if (layer.type === 'list') {
        layer.items.forEach((row, index) => {
          const sourceText = resolveLocaleValue(row.text, sourceLocale);
          if (!sourceText.trim()) return;
          items.push({
            layerId: encodeListRowId(layer.id, row.id),
            artboardId,
            sourceText,
            context: `${layer.name} • row ${index + 1}`,
          });
        });
      } else if (isGroupLayer(layer)) {
        visit(layer.children, artboardId);
      }
    }
  };
  for (const artboard of artboards) visit(artboard.layers, artboard.id);
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

/** Core measurement used by both text-layer and list-row overflow detection. */
function measureTextSized(
  value: string,
  width: number,
  style: TextStyle,
): { width: number; height: number } | null {
  try {
    const node = new Text({
      text: value,
      width,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      textDecoration: style.textDecoration,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      align: style.align,
    });
    const height = node.height();
    const measuredWidth = node.getTextWidth();
    node.destroy();
    if (!Number.isFinite(height) || height <= 0) return null;
    return { width: measuredWidth, height };
  } catch {
    return null;
  }
}

/** Measure a text layer's rendered size for a given string using an offscreen
 * Konva node. Returns null when measurement isn't possible (e.g. jsdom without
 * a real canvas) so callers can skip overflow detection gracefully. */
export function measureText(
  layer: TextLayer,
  value: string,
): { width: number; height: number } | null {
  return measureTextSized(value, layer.w, layer.style);
}

/** Width available for a list row's wrapped text, after reserving space for the
 * marker glyph and the marker gap. Clamped to a minimum so very narrow boxes
 * still wrap. */
export function listRowTextWidth(layer: ListLayer): number {
  const markerW = markerGlyphWidth(layer);
  return Math.max(8, layer.w - markerW - layer.markerGap);
}

/** Approximate on-canvas width of the marker column (glyph or asset box). The
 * renderer uses the same value so measured overflow matches the drawn layout. */
export function markerGlyphWidth(layer: ListLayer): number {
  const marker = layer.marker;
  const size = marker.size ?? layer.style.fontSize;
  if (marker.kind === 'none') return 0;
  if (marker.kind === 'asset') return size;
  if (marker.kind === 'character') return size * 1.2;
  if (marker.kind === 'dash') return size * 1.0;
  if (marker.kind === 'arrow') return size * 1.1;
  return size * 0.6; // bullet
}

/** Measure the total stacked height of every row in a list at a locale, i.e. the
 * content height the list actually needs. Returns null when not measurable. */
export function measureListHeight(
  layer: ListLayer,
  locale: LocaleCode,
): number | null {
  const width = listRowTextWidth(layer);
  let total = 0;
  for (const row of layer.items) {
    const value = resolveLocaleValue(row.text, locale);
    const measured = measureTextSized(value, width, layer.style);
    if (!measured) return null;
    total += measured.height;
  }
  return total;
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

/** Compute the overflow state for a list layer at a locale by comparing the
 * stacked row content height against the layer box. Returns undefined when it
 * fits / can't be measured. */
export function detectListOverflow(
  layer: ListLayer,
  locale: LocaleCode,
): TextOverflowState | undefined {
  const total = measureListHeight(layer, locale);
  if (total === null) return undefined;
  if (total <= layer.h + OVERFLOW_TOLERANCE) return undefined;
  return {
    hasOverflow: true,
    measuredAtLocale: locale,
    suggestedAction: 'reduce-font',
  };
}

/** Per-row geometry the renderer needs to stack rows inside the list box. When
 * offscreen measurement isn't available (e.g. jsdom), each row falls back to a
 * single-line estimate of `fontSize * lineHeight` so layout always renders. */
export function listRowLayout(
  layer: ListLayer,
  locale: LocaleCode,
): { rowHeights: number[]; totalHeight: number; markerWidth: number; rowTextWidth: number } {
  const markerWidth = markerGlyphWidth(layer);
  const rowTextWidth = Math.max(8, layer.w - markerWidth - layer.markerGap);
  const fallback = layer.style.fontSize * layer.style.lineHeight;
  const rowHeights = layer.items.map((row) => {
    const value = resolveLocaleValue(row.text, locale);
    const measured = measureTextSized(value, rowTextWidth, layer.style);
    return measured && measured.height > 0 ? measured.height : fallback;
  });
  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  return { rowHeights, totalHeight, markerWidth, rowTextWidth };
}

/** The glyph drawn for a built-in marker kind (bullet / dash / arrow). */
export function markerGlyph(marker: ListLayer['marker']): string {
  if (marker.kind === 'bullet') return '•';
  if (marker.kind === 'dash') return '—';
  if (marker.kind === 'arrow') return '→';
  return marker.character ?? '';
}
