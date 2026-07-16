import {
  MAX_AGENT_IMAGE_BYTES,
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
3. \`calqo_apply_and_preview\` — preferred fast path: validate and apply a batch
   atomically as ONE undo step, then receive the updated \`revision\`, warnings,
   and PNG in the same call. Look at it and refine with small \`updateLayer\`
   batches.
4. \`calqo_apply_operations\` / \`calqo_get_preview\` — use separately only when
   you do not need an image on every edit.
5. \`calqo_validate_operations\` — optional dry run when diagnosing a payload;
   the two apply tools already run the same validation before committing.
6. \`calqo_insert_image\` — when the user asks for generated imagery or an
   image found on the web, generate/download it with your own capability, save
   it locally, and import + place it with its absolute \`filePath\`.

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
    { "type": "setActiveArtboard", "artboardId": "…" },
    { "type": "addContentLocale", "locale": "fr", "copyFrom": "en" },
    { "type": "setActiveContentLocale", "locale": "fr" }
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
For \`line\`, \`arrow\`, and \`freehand\`, \`fill\` may be omitted; Calqo adds a
transparent fill. Their \`points\` are relative to the layer box: every x must
be within 0..w and every y within 0..h. Example: a diagonal in a 400×200 box is
\`[0, 0, 400, 200]\`. Enlarge/reposition the box instead of using negative points.

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

## Generated and web images

Use \`calqo_insert_image\` only when imagery serves the user's request. Calqo
does not call an image provider and does not fetch remote URLs; use your own
image-generation or web-fetch capability, save the result on the same machine
as Calqo, then pass its absolute path. This keeps binary out of model context:

\`\`\`json
{
  "baseRevision": "<revision from calqo_get_status>",
  "filePath": "/absolute/path/to/sunset-product-photo.png",
  "name": "sunset-product-photo.png",
  "x": 72, "y": 280, "w": 936, "h": 620,
  "fit": "cover"
}
\`\`\`

PNG, JPEG, and WebP are supported up to ${MAX_AGENT_IMAGE_BYTES / (1024 * 1024)} MiB decoded.
When no local file is available, \`dataUrl\` remains a compatibility fallback;
Calqo tolerates wrapped ASCII whitespace in its base64 payload. Provide exactly
one of \`filePath\` or \`dataUrl\`.
Geometry is optional and defaults to a full-artboard image. The call stores the
asset, adds an editable image layer in one undo step, and returns a preview plus
the new asset/layer ids. Keep text and logos as editable Calqo layers rather
than baking them into a generated image. Respect image licenses and attribution
requirements when sourcing an image from the web.

## Design rules

- Editable first: text layers for copy, list layers for bullets, shape layers
  for panels/accents/badges. Never rasterize text.
- Keep layers inside the artboard bounds; results warn about fully outside
  layers and text/list content that overflows its box.
- Text keys are per-locale records (\`"text": { "en": "…", "fr": "…" }\`).
  Register every locale you write with \`addContentLocale\` so it appears in
  Calqo's Content languages panel. The operation activates that locale and can
  seed missing values with \`copyFrom\`; use \`setActiveContentLocale\` to switch
  among already registered locales.
- Respect the user's existing layers — edit or add, don't wipe, unless asked.
- Keep compositions modest: strong hierarchy, few fonts, colors from the
  project palette when one exists.
- Reuse an existing project image by adding an image layer with its \`assetId\`;
  use \`calqo_insert_image\` to create a new raster asset.

## Errors

Failures return \`{ code, message, recoverable, details }\`. Notable codes:
\`REVISION_MISMATCH\` (re-read status, re-apply), \`VALIDATION_FAILED\` (fix the
payload; details lists issues), \`PERMISSION_DENIED\` (user approval needed),
\`LAYER_NOT_FOUND\` / \`ARTBOARD_NOT_FOUND\` (re-read the summary).
`;
