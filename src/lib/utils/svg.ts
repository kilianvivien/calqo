/** Minimal SVG hardening for AI- or user-supplied markup before it is stored as
 * an asset and rendered. Strips scripts, event handlers, external references,
 * and foreignObject so a generated icon can never execute code. This is a
 * string-level pass (works without a DOM), deliberately conservative. */
export function sanitizeSvg(raw: string): string {
  let svg = raw.trim();

  // Pull the <svg>…</svg> span out of any surrounding prose / fences.
  const open = svg.search(/<svg[\s>]/i);
  const close = svg.toLowerCase().lastIndexOf('</svg>');
  if (open >= 0 && close > open) {
    svg = svg.slice(open, close + '</svg>'.length);
  }

  svg = svg
    // Drop <script>, <foreignObject>, <iframe> blocks entirely.
    .replace(/<\s*(script|foreignObject|iframe)[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|foreignObject|iframe)[^>]*\/>/gi, '')
    // Remove inline event handlers (onload, onclick, …).
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    // Neutralise javascript: URLs and external entity references.
    .replace(/javascript:/gi, '')
    .replace(/(href|xlink:href)\s*=\s*"(?!#)[^"]*"/gi, '$1="#"');

  return svg.trim();
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
