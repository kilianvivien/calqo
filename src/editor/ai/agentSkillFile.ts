import { files } from '@/lib/adapters';
import claudeAgentSkillUrl from '../../../docs/calqo-project-maker.skill?url';

export const CALQO_AGENT_SKILL_FILENAME = 'calqo-project-maker-SKILL.md';
export const CLAUDE_AGENT_SKILL_FILENAME = 'calqo-project-maker.skill';

export const CALQO_AGENT_SKILL_CONTENT = `---
name: calqo-project-maker
description: Generate fully editable Calqo .calqo project files programmatically from a design prompt. Use when a user asks an AI coding agent to create a Calqo social post, story, thumbnail, banner, template, or editable .calqo file that can be imported into Calqo.
---

# Calqo Project Maker

Use this skill when you need to create an editable Calqo project file from a prompt. The output must be a .calqo JSON file that Calqo can import, not a flattened PNG/SVG/PDF.

## Goal

Create a local-first Calqo project with editable artboards and layers:

- Text must be Calqo text layers.
- Decorative blocks must be Calqo shape layers.
- Keep assets empty unless you also embed every asset as a data URL in the .calqo envelope.
- Prefer text and shapes so the imported file is fully editable.

## Output File

Write a JSON file with extension .calqo using this envelope:

\`\`\`json
{
  "kind": "calqo.project",
  "formatVersion": 1,
  "project": { "...": "CalqoProject" },
  "assets": []
}
\`\`\`

Calqo also accepts a bare project object, but the envelope is preferred because it is portable when assets are later added.

## Artboard Presets

Use one of these preset ids and matching dimensions:

- ig-square: 1080 x 1080
- ig-portrait: 1080 x 1350
- story: 1080 x 1920
- x-post: 1600 x 900
- linkedin-post: 1200 x 627
- facebook-link: 1200 x 630
- youtube-thumbnail: 1280 x 720
- pinterest-pin: 1000 x 1500

## Project Schema Essentials

Project fields:

- schemaVersion: 1
- id, name, createdAt, updatedAt
- contentLocales: at least one locale code, for example ["en"]
- activeContentLocale: one of contentLocales
- palette: CSS colors, preferably hex
- assets: [] unless using embedded assets
- glossary: []
- artboards: at least one artboard

Artboard fields:

- id, name, preset, width, height
- background: { "type": "solid", "color": "#RRGGBB" }
- layers: editable layer objects

Base layer fields:

- id, name, x, y, w, h
- rotation: number, usually 0
- opacity: 0..1
- visible: true
- locked: false

Text layer:

\`\`\`json
{
  "id": "layer_headline",
  "name": "Headline",
  "type": "text",
  "x": 96,
  "y": 180,
  "w": 888,
  "h": 220,
  "rotation": 0,
  "opacity": 1,
  "visible": true,
  "locked": false,
  "text": { "en": "Big editable headline" },
  "style": {
    "fontFamily": "Inter",
    "fontSize": 92,
    "fontWeight": 700,
    "color": "#FFFFFF",
    "align": "left",
    "lineHeight": 1.05,
    "letterSpacing": 0
  }
}
\`\`\`

Shape layer:

\`\`\`json
{
  "id": "layer_card",
  "name": "Card",
  "type": "shape",
  "shape": "rect",
  "x": 72,
  "y": 72,
  "w": 936,
  "h": 936,
  "rotation": 0,
  "opacity": 1,
  "visible": true,
  "locked": false,
  "fill": { "type": "solid", "color": "#0A2540" },
  "cornerRadius": 36
}
\`\`\`

Supported shape values include rect, ellipse, line, polygon, arrow, and freehand. Rectangles and ellipses are safest for generated templates.

### Fills (shapes and artboard backgrounds)

A \`fill\` is an object discriminated by \`type\`. Beyond solid colour:

\`\`\`json
{ "type": "linear", "angle": 90, "stops": [ { "offset": 0, "color": "#0A2540" }, { "offset": 1, "color": "#14B8A6" } ] }
{ "type": "radial", "stops": [ { "offset": 0, "color": "#FFFFFF" }, { "offset": 1, "color": "#0A2540" } ] }
{ "type": "pattern", "pattern": "dots", "color": "#FFFFFF", "background": "#0A2540", "scale": 1, "angle": 0 }
{ "type": "image", "assetId": "asset_photo", "fit": "cover" }
\`\`\`

Pattern values: dots, grid, hatch, cross-hatch, checker. Image/pattern fills need a matching asset.

### Stroke and stroke "looks" (shapes, text, freehand)

A \`stroke\` adds an editable outline. Beyond \`color\` and \`width\`:

\`\`\`json
{
  "color": "#FFFFFF",
  "width": 6,
  "style": "dashed",
  "cap": "round",
  "join": "round",
  "dashLen": 18,
  "gap": 10,
  "look": "neon",
  "altColor": "#00E5FF",
  "intensity": 0.8
}
\`\`\`

\`look\` applies an expressive treatment on top of colour/width. Supported looks:
plain, dashed, dotted, double, offset, outline, marker, neon, glow, hand-drawn,
rough, scribble, sketch, inner. \`altColor\` is the accent for double/offset/outline/
neon/glow/sketch/inner; \`intensity\` (0–1) tunes neon/glow. \`style\` (solid/dashed/
dotted) and \`dashLen\`/\`gap\` control plain dashing. Raster (PNG) export is the most
faithful; SVG approximates the expressive looks.

### Sticker outline, blend mode, and effects (any layer)

\`\`\`json
{
  "sticker": { "color": "#FFFFFF", "width": 12, "shadow": { "color": "#000000", "blur": 8, "offsetX": 0, "offsetY": 4, "opacity": 0.3 } },
  "blendMode": "multiply",
  "effects": { "shadow": { "color": "#000000", "blur": 16, "offsetX": 0, "offsetY": 8, "opacity": 0.25 }, "blur": 0 }
}
\`\`\`

\`sticker\` draws a coloured halo behind the layer (thumbnail/sticker look). \`blendMode\`
is one of normal, multiply, screen, overlay.

## Image Layers

To use a photo, embed it as an asset and reference it from an image layer. Add the
asset to BOTH \`project.assets\` and the envelope \`assets\` array (with a \`dataUrl\`):

\`\`\`json
{
  "id": "layer_photo",
  "name": "Photo",
  "type": "image",
  "x": 0, "y": 0, "w": 1080, "h": 720,
  "rotation": 0, "opacity": 1, "visible": true, "locked": false,
  "assetId": "asset_photo",
  "fit": "cover",
  "focalPoint": { "x": 0.5, "y": 0.4 },
  "crop": { "x": 0, "y": 0, "w": 1600, "h": 1067 },
  "mask": { "shape": "rounded", "radius": 48 },
  "filters": { "brightness": 0.1, "contrast": 0.05, "saturation": 0, "blur": 0 },
  "frame": { "kind": "polaroid", "color": "#FFFFFF", "width": 24, "caption": { "en": "Summer 2026" } }
}
\`\`\`

- \`fit\`: cover, contain, stretch. \`focalPoint\`: 0–1 anchor for a cover crop.
- \`mask.shape\`: rounded, circle, ellipse, triangle, star, hexagon (\`radius\` for rounded).
- \`frame.kind\`: inset, centered, outside, rounded, circle, double-line, polaroid,
  soft-mat, thick-poster-border, shadowed-cutout, tape-corners, postage-stamp,
  scalloped-edges, torn-paper, photo-booth-strip. Frame fields: color, width, radius
  (rounded/scalloped), padding, shadow, and per-locale \`caption\` (polaroid / photo-booth).
- Frames are non-destructive: crop/focal/mask/filter state is preserved.

If you cannot embed an image, prefer text + shape layers so the file stays editable.

## Generation Workflow

1. Interpret the user's prompt as a social visual brief: format, audience, message, tone, palette, and locale.
2. Choose one artboard preset. If unspecified, use ig-square.
3. Build one artboard with a solid background and no more than 20 layers.
4. Use editable text layers for all copy. Put localized strings under the active locale key.
5. Use editable shape layers for blocks, badges, dividers, and decorative geometry.
6. Keep every layer inside the artboard bounds.
7. Use high contrast between text and background.
8. Do not reference external images or URLs.
9. Save the envelope as a .calqo file.

## Minimal Programmatic Template

This Node.js script creates a valid editable .calqo file without external packages:

\`\`\`js
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const now = new Date().toISOString();
const id = (prefix) => prefix + "_" + randomUUID().slice(0, 8);

function textLayer(name, text, x, y, w, h, style = {}) {
  return {
    id: id("layer"),
    name,
    type: "text",
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    text: { en: text },
    style: {
      fontFamily: "Inter",
      fontSize: 64,
      fontWeight: 700,
      color: "#FFFFFF",
      align: "left",
      lineHeight: 1.1,
      letterSpacing: 0,
      ...style
    }
  };
}

function rectLayer(name, x, y, w, h, color, cornerRadius = 0) {
  return {
    id: id("layer"),
    name,
    type: "shape",
    shape: "rect",
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { type: "solid", color },
    cornerRadius
  };
}

const project = {
  schemaVersion: 1,
  id: id("proj"),
  name: "AI generated Calqo design",
  createdAt: now,
  updatedAt: now,
  contentLocales: ["en"],
  activeContentLocale: "en",
  palette: ["#0A2540", "#FFFFFF", "#E8B339"],
  assets: [],
  glossary: [],
  artboards: [
    {
      id: id("ab"),
      name: "Instagram square",
      preset: "ig-square",
      width: 1080,
      height: 1080,
      background: { type: "solid", color: "#0A2540" },
      layers: [
        rectLayer("Gold accent", 88, 130, 180, 16, "#E8B339", 8),
        {
          // Decorative outlined badge using an expressive Phase R stroke look.
          id: id("layer"),
          name: "Neon ring",
          type: "shape",
          shape: "ellipse",
          x: 760,
          y: 120,
          w: 220,
          h: 220,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          fill: { type: "solid", color: "transparent" },
          stroke: { color: "#E8B339", width: 8, look: "neon", altColor: "#E8B339", intensity: 0.8 }
        },
        textLayer("Headline", "Launch your next idea", 88, 190, 860, 220, {
          fontSize: 92,
          fontWeight: 700
        }),
        textLayer("Subtitle", "A clean editable Calqo template generated by an agent.", 88, 470, 780, 130, {
          fontSize: 38,
          fontWeight: 400,
          lineHeight: 1.25
        }),
        rectLayer("CTA pill", 88, 760, 360, 82, "#E8B339", 41),
        textLayer("CTA", "Get started", 128, 778, 280, 48, {
          fontSize: 34,
          color: "#0A2540",
          align: "center"
        })
      ]
    }
  ]
};

const calqo = {
  kind: "calqo.project",
  formatVersion: 1,
  project,
  assets: []
};

writeFileSync("generated-design.calqo", JSON.stringify(calqo, null, 2));
\`\`\`

## Validation Checklist

Before returning the file:

- JSON parses successfully.
- Envelope has kind "calqo.project" and formatVersion 1.
- project.schemaVersion is 1.
- artboards has at least one item.
- Each artboard has positive width and height matching its preset.
- Every layer has id, name, type, x, y, w, h, rotation, opacity, visible, and locked.
- Text layers use text: { "<locale>": "..." } and a complete style object.
- Shape layers use fill objects, not CSS-only shorthand.
- assets is empty, or every project asset has a matching envelope asset with a dataUrl.
- No layer references external URLs.
- The file extension is .calqo.

## Import Into Calqo

Open Calqo, use Import .calqo, and select the generated file. Calqo validates the project and opens it as a fresh editable project, so the user can select and edit every generated text and shape layer.
`;

export async function downloadCalqoAgentSkill(): Promise<void> {
  const blob = new Blob([CALQO_AGENT_SKILL_CONTENT], {
    type: 'text/markdown;charset=utf-8',
  });
  await files.downloadBlob(blob, CALQO_AGENT_SKILL_FILENAME);
}

export async function downloadClaudeAgentSkill(): Promise<void> {
  const response = await fetch(claudeAgentSkillUrl);
  if (!response.ok) {
    throw new Error('Unable to load Claude skill package.');
  }
  await files.downloadBlob(await response.blob(), CLAUDE_AGENT_SKILL_FILENAME);
}
