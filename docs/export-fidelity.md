# Export fidelity notes

Calqo renders the live editor with Konva (Canvas 2D). PNG/JPG/WebP exports are
rasterized from that same scene graph, so **raster exports are the highest-
fidelity output** — what you see on the canvas is what you get. SVG and HTML
exports are reconstructed from the project schema and intentionally trade some
fidelity for editability and small file size.

Use this table when an export looks different from the canvas.

| Feature | PNG / JPG / WebP | SVG | HTML (image wrapper) | HTML (editable) |
| --- | --- | --- | --- | --- |
| Layout, fills, strokes, text | Exact | Exact (flat fills) | Exact (it embeds a PNG) | Exact (real text/CSS nodes) |
| Gradient / pattern / image fills | Exact | Flattened to a solid colour | Exact | Gradients exact (CSS); patterns rasterized per layer |
| Image filters (brightness, contrast, saturation, blur) | Baked in | Not applied | Baked in | Rasterized per layer (warned) |
| Image masks (rounded, circle, ellipse, triangle, star, hexagon) | Exact | Not applied (full image shown) | Exact | Rounded/circle/ellipse exact (CSS); others rasterized (warned) |
| Layer blur | Exact | Omitted | Exact | Approximated via CSS `filter: blur()` (warned) |
| Drop shadow | Exact | Omitted | Exact | Approximated via CSS `filter: drop-shadow()` (warned) |
| Blend modes (multiply, screen, overlay, …) | Exact | Omitted (normal compositing) | Exact | Exact (`mix-blend-mode` — same keywords) |
| Text stroke / text shadow | Exact | May differ | Exact | Exact (`-webkit-text-stroke` / `text-shadow`) |
| Image frames | Exact | Approximated | Exact | Rasterized per layer (warned) |
| Sticker outline | Exact | Approximated | Exact | Rasterized per layer (warned) |
| Freehand brush strokes | Exact | Approximated | Exact | Rasterized per layer (warned) |
| Pressure-sensitive strokes (per-point widths) | Exact | Exact (filled ribbon polygon) | Exact | Rasterized per layer (warned) |
| Fonts | Exact (baked in) | Referenced by family | Exact (baked in) | Referenced by family — falls back if not installed on the viewer (warned) |
| Editable after export | No (flat pixels) | Yes (vector shapes/text) | No (embedded PNG) | Yes (real text nodes; rasterized-fallback layers stay images) |

## Editable HTML fidelity tiers

"HTML (editable)" exports a single self-contained `.html` file per artboard
from the **project document**, not the live Konva tree — the same
source-of-truth choice the SVG serializer makes. Every layer falls into one of
three tiers, and the export dialog always names which tier a layer landed in:

- **Faithful** — real `<p>`/`<img>`/`<div>`/inline-`<svg>` nodes: text (family,
  size, weight, style, decoration, colour, alignment, line height, letter
  spacing, shadow, stroke), images (position, size, rotation, opacity, rounded/
  circle/ellipse mask), solid and linear/radial gradient fills, rect/ellipse/
  line/polygon/arrow shapes, and blend modes.
- **Approximated (warn)** — blur and drop-shadow via CSS `filter`, which is
  visually close but not pixel-identical to the canvas renderer.
- **Rasterized fallback (warn)** — masks the CSS clip-path can't express
  (star, hexagon, triangle), manual crops, decorative frames, image filters,
  sticker outlines, freehand strokes, pattern/image fills, and icon list
  markers render as an embedded PNG of just that layer. The rest of the
  document — and every faithful-tier layer — stays real, editable markup.

The old "HTML" export mode is renamed **"HTML (image wrapper)"** so it can no
longer be mistaken for editable output; PNG remains the recommended
pixel-faithful path.

## Why SVG drops some effects

The SVG exporter emits clean, hand-editable vector markup. Filter primitives,
clip paths, and blend modes are deliberately omitted so the file stays small and
portable across tools that only support a conservative SVG subset. When these
features matter for the final asset, export PNG (or the HTML wrapper, which
embeds a PNG) instead.

## Creative frames and stroke looks (Phase R)

Decorative image **frames**, expressive **stroke looks**, and **sticker
outlines** are non-destructive, schema-backed, and fully editable — they survive
save, `.calqo` import/export, and the desktop ↔ phone round-trip. Raster export
reproduces them exactly. In SVG export:

- Dashed/dotted strokes export precisely as `stroke-dasharray`.
- Frame borders export as `<rect>`/`<ellipse>` outlines; polaroid captions and
  frame shadows may differ.
- Neon, glow, double, offset, outline, marker, and the roughened looks
  (hand-drawn, rough, scribble, sketch, inner), plus sticker outlines, are
  approximated (drawn as a plain stroke / flat halo). The editor flags these in
  the **Export notes** section so the difference is never silent.
- Creative frames built from generated outlines (scalloped, torn-paper) export
  as `<path>`; tape corners and stamp perforations export as rotated/dashed
  rects. Their shadows and fine detail may differ from raster.

The **chalk** and **crayon** freehand brushes are likewise single-node
approximations of textured marks (chalk = soft multiply, crayon = broken
sketch line); PNG export is the most faithful.

For pixel-faithful frames and stroke looks, prefer PNG export.

The editor surfaces the relevant subset of these warnings in two places:

- The **Export notes** section of the inspector, per selected layer.
- The **Before you export** panel in the export dialog, per artboard, alongside
  layout-overflow, missing-asset, large-raster, and large-batch warnings.

## Performance notes

- Only the **active artboard** mounts a Konva stage; inactive artboards are not
  rendered, so projects with many artboards stay responsive.
- Very large raster assets (> ~16 MP, e.g. 4000×4000) are flagged before export
  because they slow both editing and rasterization. Down-scaling the source
  image before import is the simplest fix.
- Exporting **all** artboards at once is sequential and throttled; large batches
  are flagged so the wait is expected, not surprising.
