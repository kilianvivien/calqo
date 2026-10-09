import type { CalqoLayer, LocaleCode } from '@/lib/schema';
import { detectTextOverflow } from '@/editor/i18n-content/translationPipeline';
import type { AIProvider } from './AIProvider';
import { COPY_OUTPUT_SCHEMA } from './outputSchemas';
import { buildCopyPrompt, type CopyAction } from './prompts';
import { repairJsonLikeResponse } from './validation';

type TextLayer = Extract<CalqoLayer, { type: 'text' }>;

export const COPY_ACTIONS: CopyAction[] = [
  'shorten',
  'rewrite',
  'punchier',
  'formal',
  'friendly',
  'proofread',
];

export type CopyResult =
  | {
      ok: true;
      text: string;
      /** The rewrite still overflows the layer's box after a shorter retry. */
      overflows: boolean;
    }
  | { ok: false; error: string };

async function requestCopy(
  provider: AIProvider,
  input: Parameters<typeof buildCopyPrompt>[0],
  signal?: AbortSignal,
): Promise<string | null> {
  const { system, user } = buildCopyPrompt(input);
  const completion = await provider.complete!({
    system,
    user,
    format: 'json',
    schema: COPY_OUTPUT_SCHEMA,
    signal,
  });
  const parsed = repairJsonLikeResponse(completion.text);
  const value = (parsed.value as { text?: unknown } | undefined)?.text;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Rewrite one text layer's copy for a locale. When the result no longer fits
 * the layer's box, the model gets one chance to tighten it. */
export async function rewriteLayerCopy(
  provider: AIProvider,
  layer: TextLayer,
  locale: LocaleCode,
  action: CopyAction,
  signal?: AbortSignal,
): Promise<CopyResult> {
  if (!provider.complete) {
    return { ok: false, error: 'This provider cannot rewrite text.' };
  }
  const source = layer.text[locale] ?? '';
  if (!source.trim())
    return { ok: false, error: 'There is no text to rewrite.' };

  const fits = (text: string) =>
    !detectTextOverflow(
      { ...layer, text: { ...layer.text, [locale]: text } },
      locale,
    );
  const sourceFits = fits(source);
  const base = { text: source, action, locale, context: layer.name };

  let text = await requestCopy(provider, base, signal);
  if (!text) return { ok: false, error: 'The provider returned no text.' };

  // Only chase the box when the original respected it; an already-overflowing
  // layer is the user's layout decision, except when they asked to shorten.
  if (!fits(text) && (sourceFits || action === 'shorten')) {
    const shorter = await requestCopy(
      provider,
      {
        ...base,
        tooLong: text,
        maxChars: Math.max(4, Math.min(source.length, text.length - 1)),
      },
      signal,
    ).catch(() => null);
    if (shorter && shorter.length < text.length) text = shorter;
  }
  return { ok: true, text, overflows: !fits(text) };
}
