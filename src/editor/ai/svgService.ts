import { SVG_LIBRARY } from '@/editor/assets/svgLibrary';
import { hasDisallowedSvgMarkup, looksLikeSvg, recolorSvg, sanitizeSvg } from '@/lib/utils/svg';
import type { AIProvider, SvgPromptInput } from './AIProvider';

export type SvgGeneration =
  | { ok: true; svg: string; warning?: string; fallback?: boolean }
  | { ok: false; error: string; raw?: string };

function fallbackSvg(input: SvgPromptInput, reason: string): SvgGeneration {
  const words = new Set(input.prompt.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const scored = SVG_LIBRARY.map((item) => {
    const haystack = `${item.id} ${item.nameKey} ${item.keywords}`.toLowerCase();
    const score = [...words].reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  const item = scored[0]?.score ? scored[0].item : SVG_LIBRARY.find((entry) => entry.id === 'sparkle');
  return {
    ok: true,
    svg: recolorSvg(item?.svg ?? SVG_LIBRARY[0].svg, input.color ?? '#111827'),
    warning: `${reason} Used a bundled SVG fallback instead.`,
    fallback: true,
  };
}

/** Generate an SVG from a prompt, then sanitise and shape-check it. Returns a
 * discriminated result so the dialog can show a clean error instead of throwing
 * (mirrors the template validation flow). */
export async function generateSvgMark(
  provider: AIProvider,
  input: SvgPromptInput,
  signal?: AbortSignal,
): Promise<SvgGeneration> {
  if (!provider.generateSvg) {
    return { ok: false, error: 'This provider cannot generate SVG.' };
  }
  let raw: string;
  try {
    const result = await provider.generateSvg(input, signal);
    raw = result.raw;
  } catch (err) {
    return fallbackSvg(input, (err as Error).message);
  }
  if (hasDisallowedSvgMarkup(raw)) {
    return {
      ok: false,
      error: 'The response contained disallowed SVG markup.',
      raw,
    };
  }
  const svg = sanitizeSvg(raw);
  if (!looksLikeSvg(svg)) {
    return fallbackSvg(input, 'The response did not contain valid SVG.');
  }
  return { ok: true, svg };
}
