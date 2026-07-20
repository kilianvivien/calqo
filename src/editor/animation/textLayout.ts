import type { CalqoLayer, LocaleCode, TextStyle } from '@/lib/schema';

/**
 * Runtime text layout for the text-reveal fragment compiler (AN-3.5). It breaks
 * a text (or list) layer's *final* per-locale content into word and character
 * fragments with boxes relative to the layer's top-left, so the fragment
 * compiler can emit per-fragment reveal tracks (typewriter / word-rise).
 *
 * None of this is persisted — fragments depend on line layout, font metrics, and
 * the active locale, so they are produced at runtime and invalidated whenever any
 * of those change (plan §4.3 / §8). The measurement is abstracted behind a
 * {@link TextMeasurer} so the layout algorithm is pure and unit-testable with a
 * deterministic fixed-advance measurer, while runtime rendering plugs in a
 * canvas-backed measurer that matches the on-canvas font.
 *
 * The layout mirrors Konva's greedy word-wrap closely enough that all three
 * renderers (live Konva, offscreen MP4, CSS/HTML) consume the *same* fragment
 * boxes and therefore agree — the boxes, not each renderer's own wrapping, are
 * the shared source of truth.
 */

/** Advance-width measurement for one font (no letter-spacing — the layout adds
 * it per glyph so a single measurer serves every letter-spacing value). */
export interface TextMeasurer {
  /** Advance width in px of `text` at the measurer's font, letter-spacing 0. */
  measure(text: string): number;
}

/** The unit a text reveal animates. */
export type FragmentUnit = 'word' | 'char';

/** One laid-out fragment (a word or a single glyph) with its box relative to the
 * layer's top-left, in unrotated layer/artboard px. */
export interface TextFragment {
  /** Reading-order index (0-based) among fragments of the same unit. */
  index: number;
  /** Line index (0-based) the fragment sits on. */
  line: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextLayout {
  words: TextFragment[];
  chars: TextFragment[];
  lineCount: number;
}

/** Konva-compatible per-line height. */
function lineHeightPx(style: TextStyle): number {
  return style.fontSize * style.lineHeight;
}

/** Advance width of a token including letter-spacing added after each glyph
 * (matching Konva's `letterSpacing * text.length` contribution). */
function advance(measurer: TextMeasurer, token: string, letterSpacing: number): number {
  if (token.length === 0) return 0;
  return measurer.measure(token) + letterSpacing * token.length;
}

interface WrappedLine {
  words: string[];
}

/** Greedy word-wrap one paragraph to `maxWidth`, matching Konva's algorithm: a
 * word that would overflow starts a new line unless the current line is empty
 * (an over-long single word is kept whole rather than force-broken). */
function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  measurer: TextMeasurer,
  letterSpacing: number,
): WrappedLine[] {
  const tokens = paragraph.split(' ');
  const lines: WrappedLine[] = [];
  let current: string[] = [];
  let currentWidth = 0;
  const spaceWidth = advance(measurer, ' ', letterSpacing);

  for (const word of tokens) {
    const wordWidth = advance(measurer, word, letterSpacing);
    const withSpace = current.length > 0 ? spaceWidth + wordWidth : wordWidth;
    if (current.length > 0 && currentWidth + withSpace > maxWidth) {
      lines.push({ words: current });
      current = [word];
      currentWidth = wordWidth;
    } else {
      current.push(word);
      currentWidth += withSpace;
    }
  }
  lines.push({ words: current });
  return lines;
}

/** Width of a laid-out line (words separated by single spaces). */
function lineWidth(words: string[], measurer: TextMeasurer, letterSpacing: number): number {
  if (words.length === 0) return 0;
  const spaceWidth = advance(measurer, ' ', letterSpacing);
  let w = 0;
  words.forEach((word, i) => {
    if (i > 0) w += spaceWidth;
    w += advance(measurer, word, letterSpacing);
  });
  return w;
}

/** Left offset of a line inside the box for the given horizontal alignment.
 * `justify` is treated as `left` for fragment boxes — inter-word justification
 * spacing is not reconstructed (documented limitation; the settled state still
 * renders through the normal static text path). */
function lineOffsetX(align: TextStyle['align'], boxW: number, width: number): number {
  switch (align) {
    case 'center':
      return Math.max(0, (boxW - width) / 2);
    case 'right':
      return Math.max(0, boxW - width);
    case 'left':
    case 'justify':
    default:
      return 0;
  }
}

/** Top offset of the whole text block for the given vertical alignment. */
function blockOffsetY(
  vAlign: TextStyle['verticalAlign'],
  boxH: number,
  totalHeight: number,
): number {
  switch (vAlign) {
    case 'middle':
      return Math.max(0, (boxH - totalHeight) / 2);
    case 'bottom':
      return Math.max(0, boxH - totalHeight);
    case 'top':
    default:
      return 0;
  }
}

/** The plain-string content of a text/list layer for `locale`, or null when the
 * layer kind carries no reveal-eligible text. List layers join their rows with
 * newlines so each row wraps as its own paragraph. */
export function layerText(layer: CalqoLayer, locale: LocaleCode): string | null {
  if (layer.type === 'text') {
    return layer.text[locale] ?? Object.values(layer.text)[0] ?? '';
  }
  if (layer.type === 'list') {
    return layer.items
      .map((item) => item.text[locale] ?? Object.values(item.text)[0] ?? '')
      .join('\n');
  }
  return null;
}

/** The text style of a reveal-eligible layer, or null. */
export function layerTextStyle(layer: CalqoLayer): TextStyle | null {
  if (layer.type === 'text' || layer.type === 'list') return layer.style;
  return null;
}

/**
 * Lay out a text/list layer's content into word and character fragments. Pure:
 * the same layer + locale + measurer produce identical fragments.
 */
export function layoutText(
  text: string,
  style: TextStyle,
  box: { w: number; h: number },
  measurer: TextMeasurer,
): TextLayout {
  const ls = style.letterSpacing;
  const lh = lineHeightPx(style);
  const paragraphs = text.split('\n');

  // Wrap every paragraph, flattening to a single ordered list of lines.
  const lines: string[][] = [];
  for (const paragraph of paragraphs) {
    for (const line of wrapParagraph(paragraph, box.w, measurer, ls)) {
      lines.push(line.words);
    }
  }

  const totalHeight = lines.length * lh;
  const offsetY = blockOffsetY(style.verticalAlign, box.h, totalHeight);
  const spaceWidth = advance(measurer, ' ', ls);

  const words: TextFragment[] = [];
  const chars: TextFragment[] = [];
  let wordIndex = 0;
  let charIndex = 0;

  lines.forEach((lineWords, lineIdx) => {
    const width = lineWidth(lineWords, measurer, ls);
    let cursorX = lineOffsetX(style.align, box.w, width);
    const y = offsetY + lineIdx * lh;

    lineWords.forEach((word, wi) => {
      if (wi > 0) cursorX += spaceWidth;
      const wordWidth = advance(measurer, word, ls);
      if (word.length > 0) {
        words.push({ index: wordIndex++, line: lineIdx, text: word, x: cursorX, y, w: wordWidth, h: lh });
        // Character fragments walk the same cursor so chars and words align.
        let charX = cursorX;
        for (const ch of word) {
          const cw = advance(measurer, ch, ls);
          chars.push({ index: charIndex++, line: lineIdx, text: ch, x: charX, y, w: cw, h: lh });
          charX += cw;
        }
      }
      cursorX += wordWidth;
    });
  });

  return { words, chars, lineCount: lines.length };
}

/**
 * A canvas-backed measurer for runtime rendering. Returns a no-op fallback (0
 * width) when no 2D context is available, so callers degrade gracefully rather
 * than throw; production callers always run in a browser/WebView with canvas.
 */
export function createCanvasMeasurer(fontShorthand: string): TextMeasurer {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    if (ctx) ctx.font = fontShorthand;
  } catch {
    ctx = null;
  }
  return {
    measure(text: string): number {
      if (!ctx) return 0;
      return ctx.measureText(text).width;
    },
  };
}

/** Build the CSS `font` shorthand for a text style (matches `konvaTextFont`). We
 * omit `font-variant` for the same WebKit-parsing reason documented there. */
export function fontShorthandFor(style: TextStyle): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}
