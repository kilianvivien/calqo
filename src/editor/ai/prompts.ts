import type { SvgPromptInput, TemplatePromptInput, TranslationJob } from './AIProvider';
import type { LocaleCode } from '@/lib/schema';

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
- shape: { "type":"shape","shape":"rect|ellipse|line", ...box..., "fill": {"type":"solid","color":hex}, "stroke"?: {"color":hex,"width":num,"look"?:strokeLook}, "cornerRadius"?:num }
Any layer may add "sticker": {"color":hex,"width":num} for a contrasting outline halo.
All coordinates are logical pixels inside the artboard box.`;

const FILL_REFERENCE = `Fill is one of:
- { "type":"solid", "color":hex }
- { "type":"linear", "angle":degrees, "stops":[{ "offset":0..1, "color":hex }, ...] }
  angle 0 runs left→right, 90 runs top→bottom, 45 runs top-left→bottom-right.
- { "type":"radial", "stops":[{ "offset":0..1, "color":hex }, ...] }   // centre outwards`;

const LAYER_REFERENCE = `Every layer has: "type", "name", "x","y","w","h" (top-left box in px), and may add
"rotation" (degrees), "opacity" (0..1),
"effects": { "shadow": { "color":hex, "blur":num, "offsetX":num, "offsetY":num, "opacity":0..1 } },
"sticker": { "color":hex, "width":num }   // contrasting outline halo.
Layer types:
- text:  "text": string, "style": TextStyle
- list:  "items": [string], "marker": { "kind":"bullet|dash|arrow|none", "color":hex }, "markerGap":num, "style": TextStyle
- shape: "shape":"rect|ellipse|line", "fill": Fill, "stroke"?: { "color":hex, "width":num, "look"?:strokeLook }, "cornerRadius"?:num
- group: "children": [Layer]   // child x/y are relative to the group's own x/y
TextStyle: { "fontFamily":string, "fontSize":num, "fontWeight":400|500|600|700|800, "color":hex, "align":"left|center|right", "verticalAlign":"top|middle|bottom", "lineHeight":num, "letterSpacing":num }
All coordinates are logical pixels inside the artboard box.`;

/** The richer contract for capable models: gradients, groups, effects and
 * plain-string copy (the importer keys it under the requested locale). */
const FULL_SCHEMA_SUMMARY = `Project JSON shape:
{
  "name": string,
  "palette": [hexColor],
  "artboards": [{
    "name": string,
    "width": number, "height": number,
    "background": Fill,
    "layers": [Layer]   // painted in order: first is at the back
  }]
}
${FILL_REFERENCE}
${LAYER_REFERENCE}`;

const DESIGN_GUIDANCE = [
  'Design quality:',
  '- Build a clear hierarchy: one dominant headline, a supporting line, and at most one call to action or badge.',
  '- Keep a safe margin of about 6% of the shorter side on every edge and align layers to a shared grid.',
  '- Size type for the canvas: headlines roughly 7–11% of the shorter side, body text 3–4.5%.',
  '- Give every text box enough room: its height must be at least lines × fontSize × lineHeight, and its width must fit the longest line.',
  '- Add depth with a gradient background, a few large soft shapes, and panels with rounded corners behind text; avoid flat single-colour layouts.',
  '- Text must stay legible: at least 4.5:1 contrast against whatever sits directly behind it.',
  '- Use group layers for units that belong together (a badge, a card with its text).',
].join('\n');

/** Build the system+user messages for prompt-a-template (plan §14.5–14.7). */
export function buildTemplatePrompt(input: TemplatePromptInput): {
  system: string;
  user: string;
} {
  const full = (input.detail ?? 'full') === 'full';
  const system = [
    'You are a graphic-design assistant that outputs a single Calqo project as JSON.',
    'Respond with JSON only — no markdown fences, no commentary.',
    full ? FULL_SCHEMA_SUMMARY : SCHEMA_SUMMARY,
    'Rules:',
    `- Emit exactly one artboard sized ${input.width}x${input.height} (preset "${input.preset}").`,
    full
      ? `- Write all text in the language of locale "${input.locale}".`
      : `- Write all text in locale "${input.locale}" keyed under that locale.`,
    `- Use at most ${input.maxLayers} layers${full ? ', counting group children' : ''}.`,
    `- Only use these fonts: ${input.fonts.join(', ')}.`,
    input.strokeLooks?.length
      ? `- For expressive strokes, only use stroke "look" values: ${input.strokeLooks.join(', ')}.`
      : '',
    input.frameKinds?.length && !full
      ? `- Image layers are not allowed, but supported frame kinds (for reference) are: ${input.frameKinds.join(', ')}.`
      : '',
    full ? '- Image and SVG layers are not allowed; draw with shapes and text only.' : '',
    input.palette?.length
      ? `- Prefer this palette: ${input.palette.join(', ')}.`
      : '- Choose a tasteful, high-contrast palette.',
    input.brandFonts?.heading
      ? `- Prefer "${input.brandFonts.heading}" for headlines.`
      : '',
    input.brandFonts?.body
      ? `- Prefer "${input.brandFonts.body}" for body and list text.`
      : '',
    ...styleReferenceLines(input),
    '- Keep every layer fully inside the artboard bounds.',
    '- Do not reference external images or URLs.',
    full ? DESIGN_GUIDANCE : '',
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
  if (ref.image) {
    lines.push(
      '- A reference image is attached. Echo its composition, colour mood, type scale and spacing — do not copy its wording or reproduce logos.',
    );
  }
  if (ref.url) {
    lines.push(`- Style source named by the user: ${ref.url}. You cannot open links; use it only as a hint about the brand or mood.`);
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
    'When an item has "maxChars", stay within it. When it has "tooLong", that earlier translation overflowed its box: return a shorter one that keeps the meaning.',
    'Keep line breaks where the source has them.',
    glossaryLines.length ? `Glossary:\n${glossaryLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const items = job.items.map((item) => ({
    layerId: item.layerId,
    sourceText: item.sourceText,
    ...(item.context ? { context: item.context } : {}),
    ...(item.maxCharsHint ? { maxChars: item.maxCharsHint } : {}),
    ...(item.previousTranslation ? { tooLong: item.previousTranslation } : {}),
  }));
  const user = JSON.stringify({ items }, null, 2);
  return { system, user };
}

/** Input for an in-place design edit (prompt-to-edit). */
export interface DesignEditPromptInput {
  instruction: string;
  locale: LocaleCode;
  width: number;
  height: number;
  /** Background + layer tree of the artboard, in the model-facing shorthand. */
  artboard: unknown;
  selectedLayerIds: string[];
  fonts: string[];
  maxOperations: number;
  hasPreview: boolean;
  repair?: { error: string; issues?: string[] };
}

/** Build the messages for editing the open artboard. The model answers with a
 * batch of the same command-level operations MCP agents use, never a rewritten
 * project, so untouched layers cannot drift. */
export function buildDesignEditPrompt(input: DesignEditPromptInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a senior graphic designer editing an existing Calqo design.',
    'You receive the current artboard as JSON and a change request.',
    'Respond with JSON only — no markdown fences, no commentary — in the shape: { "summary": string, "operations": [Operation] }.',
    '"summary" is one short sentence, in the language of the request, saying what changed on the canvas. If the request cannot be done with these operations, return no operations and say why.',
    'Operations are applied in order as one undoable step; if any is invalid, none apply:',
    '- { "type":"updateLayer", "layerId":id, "patch":{ ... } }   // only the fields you list change',
    '    patch fields: name, x, y, w, h, rotation, opacity, visible, blendMode ("normal|multiply|screen|overlay"), effects, sticker;',
    '    text layers: "text": string, "style": partial TextStyle; lists: "items": [string], "marker", "markerGap", "style"; shapes: "fill": Fill, "stroke", "cornerRadius".',
    '- { "type":"addLayer", "layer": Layer, "index"?: number }   // index in the top-level stack, 0 = back; omit to place in front',
    '- { "type":"deleteLayers", "layerIds":[id, ...] }',
    '- { "type":"reorderLayer", "layerId":id, "toIndex":number }   // top-level layers only',
    '- { "type":"groupLayers", "layerIds":[id, id, ...], "name"?: string }',
    '- { "type":"ungroupLayer", "layerId":id }',
    '- { "type":"setArtboardBackground", "background": Fill }',
    FILL_REFERENCE,
    LAYER_REFERENCE,
    'Rules:',
    '- Make the smallest set of changes that fulfils the request and leave everything else exactly as it is.',
    '- Refer to existing layers by their "id". Never change or delete a layer marked "locked": true.',
    '- Image and svg layers can be moved, resized, restacked or deleted, but you cannot create them or change what they show.',
    `- The artboard is ${input.width}x${input.height}. Keep layers inside it and keep text legible (at least 4.5:1 contrast).`,
    '- Text must fit its box: when you lengthen copy or raise fontSize, enlarge the box or reduce the size to match.',
    `- Copy is written for locale "${input.locale}"; write any new or changed text in that language.`,
    `- Only use these fonts: ${input.fonts.join(', ')}.`,
    `- Use at most ${input.maxOperations} operations.`,
    input.selectedLayerIds.length
      ? '- "selectedLayerIds" lists what the user has selected: apply the request to those layers unless it clearly concerns the whole design.'
      : '',
    input.hasPreview
      ? '- A rendering of the current artboard is attached; use it to judge spacing, overlap and contrast.'
      : '',
    input.repair
      ? [
          'Repair retry:',
          '- Your previous operations were rejected and nothing was applied. Return a corrected full answer.',
          `- Failure: ${input.repair.error}`,
          input.repair.issues?.length
            ? `- Issues: ${input.repair.issues.slice(0, 8).join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const user = JSON.stringify(
    {
      request: input.instruction,
      ...(input.selectedLayerIds.length
        ? { selectedLayerIds: input.selectedLayerIds }
        : {}),
      artboard: input.artboard,
    },
    null,
    1,
  );
  return { system, user };
}

export type CopyAction =
  | 'shorten'
  | 'rewrite'
  | 'punchier'
  | 'formal'
  | 'friendly'
  | 'proofread';

const COPY_ACTIONS: Record<CopyAction, string> = {
  shorten: 'Make it clearly shorter while keeping the key message.',
  rewrite: 'Rewrite it with fresh wording and the same meaning and length.',
  punchier: 'Make it punchier and more attention-grabbing, without adding claims.',
  formal: 'Make the tone more formal and professional.',
  friendly: 'Make the tone warmer and more conversational.',
  proofread: 'Fix spelling, grammar and punctuation only; change nothing else.',
};

export interface CopyPromptInput {
  text: string;
  action: CopyAction;
  locale: LocaleCode;
  /** What the layer is, e.g. its name, to hint at headline vs. body copy. */
  context?: string;
  /** Upper bound on characters, when the copy must fit a box. */
  maxChars?: number;
  /** A previous attempt that was still too long for the box. */
  tooLong?: string;
}

/** Build the messages for a one-layer copy edit. */
export function buildCopyPrompt(input: CopyPromptInput): {
  system: string;
  user: string;
} {
  const system = [
    'You are a copywriter for social media visuals.',
    'Respond with JSON only in the shape: { "text": string }.',
    COPY_ACTIONS[input.action],
    `Write in the language of locale "${input.locale}" — never translate.`,
    'Keep line breaks where they help the layout; do not add quotes, emoji or hashtags that were not there.',
    input.maxChars ? `Stay within ${input.maxChars} characters.` : '',
    input.tooLong
      ? 'The text in "tooLong" was an earlier attempt that did not fit; be shorter than it.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const user = JSON.stringify(
    {
      text: input.text,
      ...(input.context ? { layer: input.context } : {}),
      ...(input.tooLong ? { tooLong: input.tooLong } : {}),
    },
    null,
    1,
  );
  return { system, user };
}
