import { looksLikeSvg, sanitizeSvg } from '@/lib/utils/svg';
import type { AIProvider, SvgPromptInput } from './AIProvider';

export type SvgGeneration =
  | { ok: true; svg: string }
  | { ok: false; error: string; raw?: string };

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
    return { ok: false, error: (err as Error).message };
  }
  const svg = sanitizeSvg(raw);
  if (!looksLikeSvg(svg)) {
    return { ok: false, error: 'The response did not contain valid SVG.', raw };
  }
  return { ok: true, svg };
}
