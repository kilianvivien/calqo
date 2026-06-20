import type { SvgPromptInput, TemplatePromptInput, TranslationJob } from './AIProvider';

/** A compact, model-facing summary of the project schema. Kept terse on purpose
 * — enough to constrain output without pasting the full Zod definition. */
const SCHEMA_SUMMARY = `Project JSON shape:
{
  "schemaVersion": 1,
  "name": string,
  "contentLocales": [localeCode],
  "activeContentLocale": localeCode,
  "palette": [hexColor],
  "assets": [],
  "glossary": [],
  "artboards": [{
    "name": string,
    "preset": string,
    "width": number, "height": number,
    "background": { "type": "solid", "color": hexColor },
    "layers": [Layer]
  }]
}
Layer is one of:
- text:  { "type":"text", "name":string, "x":num,"y":num,"w":num,"h":num, "rotation":0,"opacity":1,"visible":true,"locked":false, "text": { "<locale>": string }, "style": { "fontFamily":string,"fontSize":num,"fontWeight":400|700,"color":hex,"align":"left|center|right","lineHeight":num,"letterSpacing":0 } }
- list:  { "type":"list", "name":string, ...box..., "items": [ { "id":string, "text": { "<locale>": string } } ], "marker": { "kind":"bullet|dash|arrow|none|character", "color":hex }, "markerGap":num, "style": { ...same as text.style... } }
- shape: { "type":"shape","shape":"rect|ellipse|line", ...box..., "fill": {"type":"solid","color":hex}, "stroke"?: {"color":hex,"width":num}, "cornerRadius"?:num }
All coordinates are logical pixels inside the artboard box.`;

/** Build the system+user messages for prompt-a-template (plan §14.5–14.7). */
export function buildTemplatePrompt(input: TemplatePromptInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a graphic-design assistant that outputs a single Calqo project as JSON.',
    'Respond with JSON only — no markdown fences, no commentary.',
    SCHEMA_SUMMARY,
    'Rules:',
    `- Emit exactly one artboard sized ${input.width}x${input.height} (preset "${input.preset}").`,
    `- Write all text in locale "${input.locale}" keyed under that locale.`,
    `- Use at most ${input.maxLayers} layers.`,
    `- Only use these fonts: ${input.fonts.join(', ')}.`,
    input.palette?.length
      ? `- Prefer this palette: ${input.palette.join(', ')}.`
      : '- Choose a tasteful, high-contrast palette.',
    ...styleReferenceLines(input),
    '- Keep every layer fully inside the artboard bounds.',
    '- Do not reference external images or URLs.',
    input.repair
      ? [
          'Repair retry:',
          '- The previous response failed validation. Return a corrected full project JSON.',
          `- Failure: ${input.repair.error}`,
          input.repair.issues?.length
            ? `- Issues: ${input.repair.issues.slice(0, 8).join('; ')}`
            : '',
          '- Do not explain the fix; output JSON only.',
        ]
          .filter(Boolean)
          .join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const user = `Design brief: ${input.prompt}`;
  return { system, user };
}

/** Rules describing a style reference the model should imitate (sample image /
 * URL / extracted palette), if one was provided. */
function styleReferenceLines(input: TemplatePromptInput): string[] {
  const ref = input.styleReference;
  if (!ref) return [];
  const lines: string[] = [];
  if (ref.palette?.length) {
    lines.push(`- Mimic the colour mood of this reference palette: ${ref.palette.join(', ')}.`);
  }
  if (ref.url) {
    lines.push(`- Imitate the visual style of the reference image at ${ref.url} (composition, mood, contrast).`);
  }
  if (ref.note?.trim()) {
    lines.push(`- Style note: ${ref.note.trim()}.`);
  }
  return lines;
}

/** Build the messages for AI SVG generation. */
export function buildSvgPrompt(input: SvgPromptInput): { system: string; user: string } {
  const system = [
    'You are an icon designer. Output a single, valid, self-contained SVG.',
    'Respond with SVG markup only — no markdown fences, no commentary.',
    'Rules:',
    '- Use a 0 0 24 24 viewBox and width/height of 24.',
    '- No <script>, <foreignObject>, external images, or event handlers.',
    `- Use the colour ${input.color ?? '#111827'} for the primary fill/stroke.`,
    '- Keep it clean and legible at small sizes (flat, minimal).',
  ].join('\n');
  const user = `Draw: ${input.prompt}`;
  return { system, user };
}

/** Build the messages for a translation job (plan §13.3, §14.8). */
export function buildTranslationPrompt(job: TranslationJob): {
  system: string;
  user: string;
} {
  const glossaryLines = job.glossary.map((entry) =>
    entry.mode === 'do-not-translate'
      ? `- Never translate: "${entry.source}"`
      : `- Translate "${entry.source}" as "${entry.target ?? ''}"`,
  );

  const system = [
    `You are a professional translator. Translate UI copy from "${job.sourceLocale}" to "${job.targetLocale}".`,
    'Respond with JSON only in the shape: { "items": [{ "layerId": string, "translatedText": string }] }.',
    'Preserve meaning and tone; keep translations concise so they fit the original layout.',
    glossaryLines.length ? `Glossary:\n${glossaryLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const items = job.items.map((item) => ({
    layerId: item.layerId,
    sourceText: item.sourceText,
    maxCharsHint: item.maxCharsHint,
  }));
  const user = JSON.stringify({ items }, null, 2);
  return { system, user };
}
