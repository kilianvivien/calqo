# Export fidelity notes

Calqo renders the live editor with Konva (Canvas 2D). PNG/JPG/WebP exports are
rasterized from that same scene graph, so **raster exports are the highest-
fidelity output** — what you see on the canvas is what you get. SVG and HTML
exports are reconstructed from the project schema and intentionally trade some
fidelity for editability and small file size.

Use this table when an export looks different from the canvas.

| Feature | PNG / JPG / WebP | SVG | HTML (PNG wrapper) |
| --- | --- | --- | --- |
| Layout, fills, strokes, text | Exact | Exact (flat fills) | Exact (it embeds a PNG) |
| Gradient / pattern / image fills | Exact | Flattened to a solid colour | Exact |
| Image filters (brightness, contrast, saturation, blur) | Baked in | Not applied | Baked in |
| Image masks (rounded, circle, ellipse, triangle, star, hexagon) | Exact | Not applied (full image shown) | Exact |
| Layer blur | Exact | Omitted | Exact |
| Drop shadow | Exact | Omitted | Exact |
| Blend modes (multiply, screen, overlay, …) | Exact | Omitted (normal compositing) | Exact |
| Text stroke / text shadow | Exact | May differ | Exact |
| Image frames — classic (inset, centered, outside, rounded, circle, double-line, polaroid) | Exact | Approximated (borders as rects/ellipse; caption/shadow may differ) | Exact |
| Image frames — creative (soft-mat, thick-poster-border, shadowed-cutout, tape-corners, postage-stamp, scalloped-edges, torn-paper, photo-booth-strip) | Exact | Approximated (paths/dashes export; shadows, rotation, and sprocket/tape detail may differ) | Exact |
| Stroke looks — dashed / dotted | Exact | Exact (`stroke-dasharray`) | Exact |
| Stroke looks — neon / glow / double / offset / outline / marker | Exact | Approximated (drawn as a plain stroke) | Exact |
| Stroke looks — hand-drawn / rough / scribble / sketch / inner | Exact | Approximated (drawn as a plain stroke) | Exact |
| Sticker outline (white/coloured halo) | Exact | Approximated | Exact |
| Editable after export | No (flat pixels) | Yes (vector shapes/text) | No (embedded PNG) |

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
