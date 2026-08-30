import createDOMPurify from 'dompurify';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_SVG_LENGTH = 2 * 1024 * 1024;
let purifier: ReturnType<typeof createDOMPurify> | undefined;

/** Parsed SVG sanitation is shared by upload, AI, restored and saved assets.
 * Only same-document fragment references are allowed; SVGs never fetch URLs. */
export function sanitizeSvg(raw: string): string {
  if (raw.length > MAX_SVG_LENGTH || typeof window === 'undefined') return '';
  if (!purifier) {
    purifier = createDOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', (_node, data) => {
      const name = data.attrName.toLowerCase();
      const value = data.attrValue.trim();
      if (name === 'href' || name === 'xlink:href') {
        data.keepAttr = /^#[a-zA-Z0-9_.:-]+$/.test(value);
  }
      // CSS escapes/comments can hide URL tokens. Keep ordinary inline styling,
      // but reject obfuscation and every non-fragment resource reference.
      if (
        /^(style|fill|stroke|filter|clip-path|mask|marker.*|cursor)$/.test(
          name,
        ) ||
        /url\s*\(/i.test(value)
      ) {
        const withoutFragments = value.replace(
          /url\(\s*['"]?#[a-zA-Z0-9_.:-]+['"]?\s*\)/gi,
          '',
        );
        if (
          /[\\@]|\/\*|url\s*\(|expression\s*\(|(?:https?|data|javascript):/i.test(
            withoutFragments,
          )
        )
          data.keepAttr = false;
      }
    });
  }
  const open = raw.search(/<svg[\s>]/i);
  const close = raw.toLowerCase().lastIndexOf('</svg>');
  if (open < 0 || close < open) return '';
  const clean = purifier.sanitize(raw.slice(open, close + 6), {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: [
      'style',
      'foreignObject',
      'script',
      'iframe',
      'animate',
      'animateMotion',
      'animateTransform',
      'set',
    ],
    ALLOW_DATA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) return '';
  root.setAttribute('xmlns', SVG_NS);
  return new XMLSerializer().serializeToString(root);
}

/** Re-tint an SVG to a single colour: every concrete `fill`/`stroke` value (and
 * `currentColor`) is swapped for `color`, while `none`/`transparent` are left
 * untouched so outline vs. filled marks keep their structure. Non-destructive —
 * always applied to the original markup. */
export function recolorSvg(svg: string, color: string): string {
  return svg
    .replace(/(fill|stroke)\s*=\s*"([^"]*)"/gi, (match, attr: string, value: string) => {
      const v = value.trim().toLowerCase();
      if (v === 'none' || v === 'transparent') return match;
      return `${attr}="${color}"`;
    })
    .replace(/(fill|stroke)\s*=\s*'([^']*)'/gi, (match, attr: string, value: string) => {
      const v = value.trim().toLowerCase();
      if (v === 'none' || v === 'transparent') return match;
      return `${attr}="${color}"`;
    })
    .replace(/currentColor/gi, color);
}

/** Detect constructs Calqo refuses from AI-generated SVG before sanitising, so
 * unsafe provider output is visible instead of silently rewritten. */
export function hasDisallowedSvgMarkup(raw: string): boolean {
  return (
    /<\s*(script|foreignObject|iframe)[\s>/]/i.test(raw) ||
    /\son\w+\s*=/i.test(raw) ||
    /javascript:/i.test(raw) ||
    /(href|xlink:href)\s*=\s*["'](?!#)[^"']+["']/i.test(raw)
  );
}

/** Returns true when the string looks like usable SVG markup. */
export function looksLikeSvg(raw: string): boolean {
  return /<svg[\s>]/i.test(raw) && /<\/svg>/i.test(raw);
}

/** Best-effort intrinsic size from a viewBox or width/height attributes,
 * defaulting to a square so insertion always has dimensions. */
export function extractSvgSize(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/viewBox\s*=\s*"([\d.\s-]+)"/i);
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  const width = svg.match(/\bwidth\s*=\s*"([\d.]+)/i);
  const height = svg.match(/\bheight\s*=\s*"([\d.]+)/i);
  const w = width ? Number(width[1]) : NaN;
  const h = height ? Number(height[1]) : NaN;
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return { width: 240, height: 240 };
}
