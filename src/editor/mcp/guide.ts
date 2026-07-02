import {
  MAX_LAYERS_PER_ARTBOARD,
  MAX_OPERATIONS_PER_BATCH,
} from './operationSchemas';

/** The drawing guide returned by `calqo_get_guide` and the
 * `calqo://schema/operations` resource. Many MCP hosts never read resources,
 * so the guide is a tool too and `calqo_get_status` points at it. */
export const MCP_AGENT_GUIDE = `# Drawing in Calqo over MCP

You are connected to a live Calqo document. Everything you create stays fully
editable for the user: real text, shape, SVG, and list layers on artboards.

## Workflow

1. \`calqo_get_status\` — see the active project, artboard, and current \`revision\`.
2. \`calqo_create_project\` — only when no project is open or the user wants a new one.
3. \`calqo_apply_operations\` — the main tool: a batch of operations, applied
   atomically as ONE undo step. Pass \`baseRevision\` from your last read so you
   never overwrite the user's concurrent edits.
4. \`calqo_get_preview\` — render the artboard as a PNG, look at it, refine.
5. \`calqo_validate_operations\` — optional dry run when unsure about a payload.

The first write asks the user for approval in Calqo; if a write fails with
PERMISSION_DENIED, tell the user to approve agent drawing (or call
\`calqo_request_control\` to trigger the prompt).

## Operations (calqo_apply_operations)

\`\`\`json
{
  "baseRevision": "<revision from calqo_get_status>",
  "operations": [
    { "type": "addLayer", "layer": { /* full layer */ }, "index": 0 },
    { "type": "updateLayer", "layerId": "…", "patch": { "x": 96, "opacity": 0.9 } },
    { "type": "deleteLayers", "layerIds": ["…"] },
    { "type": "reorderLayer", "layerId": "…", "toIndex": 0 },
    { "type": "groupLayers", "layerIds": ["…", "…"], "name": "Header" },
    { "type": "ungroupLayer", "layerId": "…" },
    { "type": "addArtboard", "preset": "story", "name": "Story variant" },
    { "type": "setActiveArtboard", "artboardId": "…" }
  ]
}
\`\`\`

Limits: at most ${MAX_OPERATIONS_PER_BATCH} operations per batch and
${MAX_LAYERS_PER_ARTBOARD} layers per artboard. You may provide your own layer
ids; if one collides, Calqo mints a replacement and returns it in \`idMap\`.
Later operations in the same batch may reference layers added earlier in it.

## Layer shapes

Common fields (all layers): \`id\`, \`name\`, \`type\`, \`x\`, \`y\`, \`w\`, \`h\`,
\`rotation\` (deg), \`opacity\` (0–1), \`visible\`, \`locked\`. Coordinates are
artboard pixels, origin top-left.

Text layer:

\`\`\`json
{
  "id": "layer_headline", "name": "Headline", "type": "text",
  "x": 96, "y": 132, "w": 888, "h": 180,
  "rotation": 0, "opacity": 1, "visible": true, "locked": false,
  "text": { "en": "Summer launch" },
  "style": {
    "fontFamily": "Inter", "fontSize": 88, "fontWeight": 800,
    "fontStyle": "normal", "textDecoration": "none",
    "color": "#FFFFFF", "align": "left", "lineHeight": 1.05, "letterSpacing": 0
  }
}
\`\`\`

Shape layer (\`shape\`: \`rect\` | \`ellipse\` | \`line\` | \`polygon\` | \`arrow\`):

\`\`\`json
{
  "id": "layer_badge", "name": "Badge", "type": "shape", "shape": "rect",
  "x": 96, "y": 796, "w": 360, "h": 112,
  "rotation": 0, "opacity": 1, "visible": true, "locked": false,
  "fill": { "type": "solid", "color": "#E8B339" },
  "cornerRadius": 32
}
\`\`\`

Fills may also be gradients:
\`{ "type": "linear", "angle": 45, "stops": [{ "offset": 0, "color": "#0A2540" }, { "offset": 1, "color": "#123A6B" }] }\`.
Strokes: \`"stroke": { "color": "#111827", "width": 3 }\`.
Lines/arrows use \`points\` relative to the layer box: \`[0, 0, 400, 0]\`.

List layer (bullet lists / agendas):

\`\`\`json
{
  "id": "layer_agenda", "name": "Agenda", "type": "list",
  "x": 96, "y": 400, "w": 640, "h": 320,
  "rotation": 0, "opacity": 1, "visible": true, "locked": false,
  "items": [
    { "id": "item_1", "text": { "en": "Doors open" } },
    { "id": "item_2", "text": { "en": "Keynote" } }
  ],
  "marker": { "kind": "bullet", "color": "#111827" },
  "markerGap": 12,
  "style": { "fontFamily": "Inter", "fontSize": 36, "fontWeight": 500,
    "fontStyle": "normal", "textDecoration": "none", "color": "#111827",
    "align": "left", "lineHeight": 1.3, "letterSpacing": 0 }
}
\`\`\`

## Design rules

- Editable first: text layers for copy, list layers for bullets, shape layers
  for panels/accents/badges. Never rasterize text.
- Keep layers inside the artboard bounds; the result reports warnings when a
  layer lands fully outside.
- Text keys are per-locale records (\`"text": { "en": "…", "fr": "…" }\`); write
  the project's \`activeContentLocale\` at minimum.
- Respect the user's existing layers — edit or add, don't wipe, unless asked.
- Keep compositions modest: strong hierarchy, few fonts, colors from the
  project palette when one exists.
- Image layers need an \`assetId\` that already exists in the project; you
  cannot import new image assets over MCP yet.

## Errors

Failures return \`{ code, message, recoverable, details }\`. Notable codes:
\`REVISION_MISMATCH\` (re-read status, re-apply), \`VALIDATION_FAILED\` (fix the
payload; details lists issues), \`PERMISSION_DENIED\` (user approval needed),
\`LAYER_NOT_FOUND\` / \`ARTBOARD_NOT_FOUND\` (re-read the summary).
`;
