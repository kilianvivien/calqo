import type Konva from 'konva';

interface FontContext {
  fontStyle(): string;
  fontSize(): number;
  fontFamily(): string;
  getAttr(key: string): unknown;
}

/** Build the CSS `font` shorthand for a Konva text node. We can't use
 * `node._getContextFont()` here directly because Konva 9 has no `fontWeight`
 * prop — the slot is omitted from the string it builds, so weight silently
 * drops to 400. The CalqoText wrapper stashes the real weight on a custom
 * `fontWeight` attribute that we read here.
 *
 * Format is `[style] [weight] [size]px [family]`. We deliberately omit
 * `font-variant: normal` — it's the default and some webview font parsers
 * (notably WebKit on macOS) mis-parse the doubled `normal normal <weight>`
 * token, causing 700 and 800 to resolve to the same face. */
export function buildCanvasFontString(node: FontContext): string {
  const style = node.fontStyle();
  const weight =
    (node.getAttr('fontWeight') as number | string | undefined) ?? 400;
  const size = node.fontSize();
  const family = node.fontFamily();
  return `${style} ${weight} ${size}px ${family}`;
}

let patchPromise: Promise<void> | null = null;

/** Konva 9's Text config exposes `fontStyle` (CSS `font-style`) and
 * `textDecoration` (CSS `text-decoration`) but no `fontWeight`. We patch
 * `_getContextFont` to read a custom `fontWeight` attribute and build a
 * proper CSS `font` shorthand. Imported once at app start; idempotent.
 * The Konva value import is lazy so the pure `buildCanvasFontString` is
 * unit-testable in jsdom without pulling Konva's node entry. */
export function patchKonvaTextFont(): Promise<void> {
  if (patchPromise) return patchPromise;

  // Dynamic import keeps `import Konva from 'konva'` out of the module's
  // top-level graph — Konva's node entry requires the `canvas` package,
  // which isn't available in our jsdom test env.
  patchPromise = import('konva').then((mod) => {
    const KonvaValue = (mod as { default: { Text: unknown } }).default;
    const TextCtor = KonvaValue.Text as unknown as {
      prototype: Konva.Text & { _getContextFont(): string };
    };
    TextCtor.prototype._getContextFont = function patchedGetContextFont(
      this: Konva.Text,
    ) {
      return buildCanvasFontString(this);
    };
  });
  return patchPromise;
}
