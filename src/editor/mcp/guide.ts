import {
  MAX_AGENT_IMAGE_BYTES,
  MAX_LAYERS_PER_ARTBOARD,
  MAX_OPERATIONS_PER_BATCH,
} from './operationSchemas';

/** Small enough to read without delaying the first edit. The complete guide
 * remains available through the operations resource for advanced features. */
export const MCP_AGENT_QUICK_GUIDE = `# Calqo MCP quick start

Start with one \`calqo_get_status\` call. If there is no active project, create
one. Otherwise make the first edit immediately with \`calqo_apply_and_preview\`.
Its operation schema is the source of truth and it already validates atomically,
so do not dry-run ordinary batches.

For a new composition, send the complete first draft as one substantial batch:
background/panels first, then editable text, lists, shapes, SVGs, and images.
Use stable descriptive layer ids. Inspect the returned preview, make only
meaningful refinements, and finish once the brief is met; one or two refinement
passes are normally enough. Use \`calqo_apply_operations\` when no preview is
needed. Preserve existing work unless the user asked to replace it.

Keep all user-facing progress plain and visual. Say what is changing on the
canvas, such as “I’ve set the layout and am tightening the spacing.” Do not
mention MCP calls, JSON, schemas, operation batches, layer ids, revisions, or
validation details unless the user needs them to resolve a problem. Avoid
narrating every internal step. At completion, briefly describe the visible
result and confirm that its text and design elements remain editable.

Read \`calqo://schema/operations\` only when you need animation, keyframes,
multilingual content, generated/web images, advanced effects, or help after a
validation error.`;

/** Complete advanced guide returned by `calqo://schema/operations`. The guide
 * tool intentionally returns the quick version so it cannot delay first edit. */
export const MCP_AGENT_GUIDE = `# Drawing in Calqo over MCP

You are connected to a live Calqo document. Everything you create stays fully
editable for the user: real text, shape, SVG, and list layers on artboards.

## Workflow

1. \`calqo_get_status\` — make this the only required setup call. It tells you
   whether to create a project or begin editing.
2. \`calqo_create_project\` — only when no project is open or the user wants a new one.
3. \`calqo_apply_and_preview\` — preferred fast path: validate and apply a batch
   atomically as ONE undo step, then receive the updated \`revision\`, warnings,
   and PNG in the same call. Build a complete first draft in one substantial
   batch, then make only meaningful refinements; one or two passes are normally
   enough.
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

Do not read this full guide before ordinary text-and-shape work: the tool schema
is enough. Do not dry-run normal batches, inspect Calqo's source code, or keep
iterating after the requested result is visibly complete.

## Talking to the user

Use short, non-technical progress updates about visible outcomes. For example:
“I’ve built the main composition and am refining contrast and spacing.” Keep
MCP calls, JSON, schemas, operation batches, ids, revisions, and validation
mechanics internal unless the user must act on a problem. Do not narrate every
tool call. Finish with a brief description of the design and what remains
editable.

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

## Animating a design (Animate mode)

Calqo turns a static design into a short clip (≤ 60 s) by animating layers with
presets, all inside the same batch. Animation edits are command-level operations
— never raw project JSON — and are validated exactly like a user's before they
commit.

Per-layer preset slots: \`enter\` (plays in at scene start), \`emphasis\` (loops
in the hold), \`exit\` (plays out at scene end). A layer is preset-authored OR
custom, never both.

Preset kinds by slot:

- enter / exit: \`fade\`, \`slide\`, \`pop\`, \`rise\`, \`wipe\`, \`blur-in\`.
  \`slide\`, \`rise\`, \`wipe\` take a \`direction\` (\`up\`|\`down\`|\`left\`|\`right\`);
  \`slide\`/\`rise\` also take a \`distance\` in px.
- emphasis (loop, settles to identity): \`pulse\`, \`wiggle\`, \`float\`.
- text reveals (enter slot, text layers only): \`typewriter\` reveals character
  by character, \`word-rise\` lifts words in sequence.

Preset instance fields: \`kind\` (required), \`duration\` ms (required),
\`delay\` ms from the slot anchor (required), optional \`easing\`
(\`linear\`|\`ease-in\`|\`ease-out\`|\`ease-in-out\`|\`overshoot\`|\`bounce\`),
optional \`direction\`/\`distance\` where the kind supports them. An enter window
(delay + duration) must fit the scene; an exit window must not start before it;
enter and exit must not overlap.

\`\`\`json
{
  "baseRevision": "<revision>",
  "operations": [
    { "type": "setSceneDuration", "durationMs": 4000 },
    { "type": "setClipFps", "fps": 30 },
    { "type": "setLayerPreset", "layerId": "layer_headline", "slot": "enter",
      "preset": { "kind": "rise", "duration": 600, "delay": 0, "direction": "up", "distance": 80, "easing": "ease-out" } },
    { "type": "setLayerPreset", "layerId": "layer_badge", "slot": "emphasis",
      "preset": { "kind": "pulse", "duration": 900, "delay": 0 } },
    { "type": "setLayerPreset", "layerId": "layer_headline", "slot": "exit",
      "preset": { "kind": "fade", "duration": 400, "delay": 0 } },
    { "type": "setLayerPreset", "layerId": "layer_badge", "slot": "enter", "preset": null }
  ]
}
\`\`\`

- \`setLayerPreset\` sets/replaces a slot, or clears it with \`"preset": null\`.
- \`clearLayerAnimation\` removes all animation from a layer.
- \`setSceneDuration\` sets a scene's length (250–60000 ms) and stretches any
  keyframes/custom windows on it to match; \`setClipFps\` sets 24/30/60.

### Keyframes

Presets cover most motion. Reach for keyframes when the user asks for a
specific path or timing a preset cannot express — "drift left while fading",
"pop at 1.2 s, settle by 2 s".

\`setLayerMotionKeyframe\` writes one whole transform pose at a time onto the
same compact lane the user's **Keyframes** tab edits, so everything you author
stays editable by hand afterwards:

\`\`\`json
{ "type": "setLayerMotionKeyframe", "layerId": "layer_badge", "timeMs": 1200,
  "pose": { "dx": -40, "scaleX": 1.2, "scaleY": 1.2, "opacity": 1 },
  "easing": "overshoot" }
\`\`\`

- \`pose\` fields: \`dx\`/\`dy\` (px from the layer's design position),
  \`scaleX\`/\`scaleY\` (1 = design size), \`rotation\` (deg about the centre),
  \`opacity\` (0–1). Every field is optional and any you omit keeps the value the
  layer already shows at \`timeMs\` — so a partial pose is a targeted change, and
  omitting \`pose\` entirely inserts a pose that changes nothing (useful as a
  hold before a move).
- A lane always spans the scene: the first call creates poses at 0 ms and the
  scene end, then each further call inserts or updates one.
- \`easing\` applies *into* the pose (\`linear\`, \`ease-in\`, \`ease-out\`,
  \`ease-in-out\`, \`overshoot\`, \`bounce\`); it defaults to \`ease-in-out\` and is
  ignored at 0 ms.
- \`deleteLayerMotionKeyframe\` removes one intermediate pose
  (\`{ "type": "deleteLayerMotionKeyframe", "layerId": "…", "timeMs": 1200 }\`).
  The first and last poses are permanent — use \`clearLayerAnimation\` to drop
  the whole lane.
- Presets and keyframes are mutually exclusive per layer. On a preset-animated
  layer, \`setLayerMotionKeyframe\` fails rather than silently discarding the
  user's effects; call \`clearLayerAnimation\` first if replacing them is what
  the user wants.

\`setLayerCustomWindows\` remains the escape hatch for motion the pose lane
cannot express (per-property windows, \`wipe-progress\`, \`blur\`). Every window
must fit inside the scene and no two may overlap on the same property. Windows
written this way are *not* editable in the user's keyframe lane, so prefer
\`setLayerMotionKeyframe\` for ordinary transform motion.

### Reading existing animation

Layer summaries carry an \`animation\` field so you can refine motion instead of
overwriting it: \`{"mode":"preset", …}\` with the instances,
\`{"mode":"keyframes","times":[0,1200,4000],"poses":[…]}\` for a compact lane, or
\`{"mode":"custom","windows":[…]}\` for raw windows. Artboards report
\`sceneDurationMs\`, and the project reports \`clip\` (fps and scenes).

Multi-scene clips (an ordered set of artboards joined by transitions):

- \`setClipScenes\` replaces the ordered list:
  \`{ "type": "setClipScenes", "scenes": [ { "artboardId": "ab1" }, { "artboardId": "ab2", "transition": "fade", "transitionDurationMs": 500 } ] }\`.
  The transition plays *into* a scene from the previous one (\`cut\`|\`fade\`|\`slide\`;
  the first scene's is ignored). All scenes share the clip's dimensions and the
  total (scene durations + transitions) must stay ≤ 60 s.
- \`reorderScene\` moves a scene by index; \`setSceneTransition\` sets the
  transition into scene \`index\`. An empty \`setClipScenes\` clears the multi-scene
  clip and exports just the active artboard.

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
