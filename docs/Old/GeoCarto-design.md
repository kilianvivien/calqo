# GeoCarto — Design System

How to reproduce, extend, and apply the visual language of the GeoCarto mock (`mock.html`). The aesthetic target is **macOS Tahoe liquid glass**: translucent surfaces, soft refractive highlights, generous radii, system-blue accent, and motion that feels physical without being theatrical.

---

## 1. Core principles

1. **Glass over solid.** Every floating panel uses a layered translucent surface (backdrop blur + saturation boost + inner highlight + outer shadow). Solid fills appear only on primary actions.
2. **Continuous rounded geometry.** Nothing has sharp corners. The window itself is rounded; panels nested inside echo that radius at a smaller scale.
3. **One accent.** macOS system blue is the only saturated color in the chrome. It carries selection, primary action, focus rings, and active-tab state. Map content uses its own palette but does not compete.
4. **Motion is feedback, not decoration.** Every animation is tied to a real user signal (hover, click, theme switch, pin placement, tab swap). The only idle loops are a pulse on selected pins and a marching-ants ring on the active selection.
5. **Density is calm.** 13 px base, generous gaps, all-uppercase tracked eyebrows for section headers. Tertiary text disappears unless the user looks at it.

---

## 2. Design tokens

All tokens live as CSS custom properties on `html[data-theme="…"]`. Switching theme = swapping the variable set, no DOM redraw.

### 2.1 Color (light theme)

| Token | Value | Use |
|---|---|---|
| `--text` | `#1d1d1f` | Headings, primary text |
| `--text-2` | `#4a4a4f` | Body, icon strokes |
| `--text-3` | `#86868b` | Tertiary labels, captions, mono meta |
| `--accent` | `#007aff` | Primary action, selection, links, active tab |
| `--accent-strong` | `#0a6fe3` | Bottom gradient stop on primary button |
| `--accent-soft` | `rgba(0,122,255,0.16)` | Active-tab fill, selected-row tint |
| `--accent-ring` | `rgba(0,122,255,0.35)` | Focus glow, active-tab hairline |
| `--glass` | `rgba(255,255,255,0.55)` | Standard floating panel |
| `--glass-strong` | `rgba(255,255,255,0.78)` | Window background, small overlays |
| `--glass-thin` | `rgba(255,255,255,0.35)` | Inputs, tree container, layer rows |
| `--glass-border` | `rgba(255,255,255,0.85)` | Top-edge highlight on glass |
| `--divider` | `rgba(0,0,0,0.07)` | Hairlines |
| `--hover` | `rgba(0,0,0,0.04)` | Hover wash |
| `--active` | `rgba(0,0,0,0.07)` | Pressed wash |
| `--land` / `--water` | `#e6dfcf` / `#d2e3f3` | Map base palette |
| `--land-fr` | `rgba(0,122,255,0.18)` | Highlighted French territory |
| `--grid` | `rgba(0,30,80,0.07)` | Graticule lines |

### 2.2 Color (dark theme)

Same tokens, retuned. The wallpaper switches from pastel radial gradients to deep navy / plum / forest gradients on near-black. Glass becomes `rgba(40,42,52,0.55)`. Accent shifts to `#0a84ff`. Map water becomes near-black (`#161a22`), land becomes graphite (`#2c2e36`). The inner top-sheen drops from 0.9 to 0.06 opacity — never zero, because that single-pixel highlight is what tells the eye the surface is curved.

### 2.3 Wallpaper

The background is **never** flat. It is a stack of large soft radial gradients that simulate a macOS desktop wallpaper:

```css
background:
  radial-gradient(1200px 800px at 15% 10%,  #cfe1ff 0%, transparent 55%),
  radial-gradient(1000px 700px at 90% 20%,  #ffd9e7 0%, transparent 50%),
  radial-gradient(1100px 800px at 70% 95%,  #d2f0e1 0%, transparent 55%),
  linear-gradient(135deg, #eef2f8 0%, #e7ecf3 100%);
```

This is what gives the glass panels something to refract.

### 2.4 Radii

| Token | Px | Use |
|---|---|---|
| `--radius-xs` | 6 | Tree rows, swatches |
| `--radius-sm` | 10 | Tool buttons, preset cards |
| `--radius-md` | 14 | Panels, canvas, window |
| `--radius-lg` | 20 | Large floating cards |
| `--radius-xl` | 28 | Big modals |
| `--radius-window` | 14 | App window outer corner |

Radii descend with nesting: window 14 → panel 14 → input/tab 10 → row 6.

### 2.5 Spacing

A simple 4-px scale: `--gap-1: 4`, `--gap-2: 8`, `--gap-3: 12`, `--gap-4: 16`, `--gap-5: 24`, `--gap-6: 32`. Panel internal padding is 14–18 px; the window margin around panels is 12 px (6 px between sibling panels).

### 2.6 Typography

- Stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", system-ui, sans-serif`
- Mono: `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace` — used for coordinates, scale, zoom, all numeric meta
- Base size: 13 px / line-height 1.4 / letter-spacing −0.005em
- Scale:
  - Title block H1: 17 px / 700 / −0.015em
  - Selection name: 13 px / 600
  - Section heads ("eyebrow"): 10 px / 600 / +0.12em / uppercase / `--text-3`
  - Labels: 11.5 px / 500 / `--text-3`
  - Status bar: 10.5 px / mono / `--text-3`

### 2.7 Motion

| Token | Value | Use |
|---|---|---|
| `--t-fast` | 160 ms | Hover, press, micro-feedback |
| `--t-base` | 240 ms | Toggles, tab switches, chevron rotations |
| `--t-slow` | 420 ms | Entrance animations, theme change |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Buttons, thumbs, pin drops, preset hover |

Rule of thumb: anything tactile uses spring; anything "fades" uses ease-out.

---

## 3. The liquid-glass recipe

A glass panel is **four layered effects** on the same element. Drop one and the illusion breaks.

```css
.glass {
  /* 1. translucent fill (theme-aware) */
  background: var(--glass);

  /* 2. real backdrop blur — saturate boost is what makes it feel like glass, not frosted plastic */
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);

  /* 3. hairline top-edge highlight (inner) + outer hairline (0.5px) */
  border: 0.5px solid var(--glass-border);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.9) inset,   /* top sheen */
    0 0 0 0.5px rgba(0,0,0,0.06),          /* crisp outer hairline */
    0 12px 40px rgba(20,40,80,0.14),       /* far ambient */
    0 2px 6px  rgba(20,40,80,0.06);        /* near contact */

  border-radius: var(--radius-md);
}
```

Blur strength scales with surface importance:
- 40 px on the window itself
- 30 px on inspector, tool rail, title block, legend
- 20 px on small overlays (zoom stack, scale bar)

---

## 4. Layout

The whole app is a 3-row grid inside a single rounded container:

```
window  ── grid-template-rows: 44px 1fr 28px
            titlebar / workspace / statusbar

workspace ── grid-template-columns: 60px 1fr 300px
            tool-rail / canvas / inspector
```

There is **no secondary toolbar / tool-options bar**. Tool-specific controls live in the inspector (§4.4) and swap when the active tool changes — see §4.4.0 for the reasoning. Anything that lives "globally" across tools (undo, redo, snap) goes into the title-bar action cluster (§4.1).

Panel margins are uniform 12 px outside, 6 px between siblings. The canvas is the only element that goes edge-to-edge of its grid cell; all other panels have rounded corners visible on all sides.

The tool rail gets its own stacking context (`position: relative; z-index: 5`) and the hovered tool jumps to `z-index: 30` so its tooltip can escape over the canvas.

### 4.0 System menu bar (above the window)

GeoCarto mimics the macOS system menu — a thin translucent bar pinned to the top of the screen, **outside** the app window. This is the only chrome that is not inside the rounded window container.

- 26 px tall, full viewport width, fixed to `top: 0`
- Light: `rgba(255,255,255,0.45)` + `backdrop-filter: blur(24px) saturate(180%)`; dark: `rgba(20,22,28,0.55)`
- Left cluster: 13×14 Apple glyph (filled, `currentColor`) · bold app name "GeoCarto" · menu items (File · Edit · View · Object · Help)
- Right cluster (mock-only flavor): tiny battery + wifi glyphs + a clock (`Mon 12:42`) in `--text-2`, 11.5 px tabular-nums
- Menu items: `.menu-item`, 24 px tall, 9 px horizontal padding, 6 px radius. Hover → `--hover`; open → `--accent-soft` background, `--accent` text
- Clicking a menu item opens a `.menu-popover` anchored at its bottom-left, 4 px gap
- Hovering a sibling menu item **while another popover is open** swaps the open popover instantly — no flicker, no animation
- `-webkit-app-region: drag` on the bar itself, `no-drag` on every interactive child (so the user can drag the OS window by the bar background)

**Why a real system bar instead of a window-embedded one.** macOS apps never put their app menus inside the document window — those are reserved for window-scoped controls. Putting `File / Edit / View` inside the title bar reads as a Windows/Linux convention and breaks the macOS Tahoe illusion. Keep this bar outside the rounded window even when the desktop wrapper is a browser tab.

### 4.0a Popover stacking caveat

**Important.** The app window has `animation: window-in …` whose keyframes set `transform: translateY(…) scale(…)`. A `transform` creates a new containing block for descendants with `position: fixed`. Any element that needs to anchor to the **viewport** — menu dropdowns, context menus, the modal backdrop — must therefore be rendered as a **sibling of the window**, not inside it. Otherwise `getBoundingClientRect()` returns viewport coords but the fixed-positioned element resolves them relative to the window, and the popover lands far from its anchor.

In practice: keep popovers, the modal, and any future overlay layer (command palette, mini-map detached view, etc.) at the document `<body>` level. Only elements that should travel with the window's entrance animation (toast stack, canvas overlays) stay inside.

### 4.1 Title bar

- 44 px tall, draggable region (`-webkit-app-region: drag`) except interactive children
- Traffic-light buttons (12 px circles, 8 px gap) on the left — colored fills only, glyphs appear on hover. **No menu items here** — those live in the system menu bar (§4.0)
- Centered "title chip": doc-icon + filename + edit-state, wrapped in a pill that brightens on hover
- Right-side action cluster, in order:
  - **Undo** · **Redo** — 28 px icon buttons
  - **Snap** — 28 px icon button; pressed state is the `.is-active-pressed` modifier (`--accent-soft` background + `--accent` icon) so it reads like a sticky toggle, not a one-shot action
  - 0.5 px vertical divider
  - **Theme toggle** (sun / moon crossfade) · **Share** icon button · primary blue **Export** pill (opens the modal — §6b)

These three actions sit in the title bar because they're **global** — they apply regardless of which tool is active. Anything that varies per tool goes in the inspector instead (§4.4.0).

### 4.2 Tool rail

- 36 × 36 px tool buttons, 4 px gap, vertical stack
- Active state = filled accent with a soft outer glow shadow (`0 4px 14px rgba(0,122,255,0.35)`)
- Hover: scale 1.05 + neutral hover wash; press: scale 0.94
- Tooltip slides in from the right (4 px translate + fade) and shows shortcut as a `<kbd>` in `--text-3`
- Hairline dividers (24 × 0.5 px) separate semantic groups: **navigation / drawing / annotation**

Tool inventory (top → bottom, with letter shortcuts that bind in production):

| Group | Tool | Shortcut |
|---|---|---|
| Navigation | Move | V |
| Navigation | Marquee | M |
| Navigation | Pan (hand) | H |
| Navigation | Ruler | K |
| Drawing | Pen | P |
| Drawing | Rectangle | R |
| Drawing | Ellipse | O |
| Drawing | Polygon | G |
| Drawing | Text | T |
| Drawing | Paint area | B |
| Drawing | Pin | I |
| Drawing | Arrow | A |
| Drawing | Image | J |
| Annotation | Legend | L |
| Annotation | Comment | C |

Each tool button carries `data-tool="<key>"`. Activating it swaps the matching `.tool-pane[data-tool-pane="<key>"]` inside the inspector's Properties tab (and auto-jumps to that tab), then fires a brief toast. Clicking the same active tool again is a no-op.

### 4.3 Canvas

- The map is an inline `<svg>` filling the cell; floating overlays (title block, legend, zoom stack, scale bar) are absolutely positioned **inside** an overlay layer that sits above the SVG but inside the canvas border
- Title block: top-left, glass panel, with an accent eyebrow + H1 + meta
- Legend: bottom-left, glass panel, swatch + label rows (capital embassy / embassy / French territory)
- Zoom controls: top-right, vertical stack of icon buttons separated by 0.5 px hairlines, glass-strong (zoom in / out / fit / compass)
- Scale bar: bottom-right, mono numerals + a 50/50 black-and-white bar

### 4.4 Inspector (right)

The inspector is a 3-tab panel with persistent header and a body that swaps content per pane.

#### 4.4.0 The tool-driven Properties pattern

**Tools do not get their own toolbar — they drive the inspector.** When a user picks a tool from the rail, the **Properties** tab swaps to that tool's pane and the Properties tab is auto-activated. There is no separate "tool options" surface; everything that varies per tool lives in one place.

Why: the alternative — a secondary toolbar under the title bar — duplicates the inspector's purpose, eats vertical space, and forces a horizontal layout for controls that are happier vertical (color grids, multi-line steppers, hint blocks). One inspector keeps the chrome simple and gives every tool the room it needs.

```html
<div class="pane" data-pane="properties">
  <div class="tool-pane" data-tool-pane="move">  …selection-driven content… </div>
  <div class="tool-pane" data-tool-pane="pin"  hidden> …pin defaults… </div>
  <div class="tool-pane" data-tool-pane="text" hidden> …text defaults… </div>
  …
</div>
```

Switching tool = toggling `hidden` on the matching `.tool-pane`. No animation — the surrounding tab chrome is the constant, the contents simply replace.

**Two pane kinds.**
1. **Move tool pane** — the *selection-driven* pane. Shows whatever is currently selected on the canvas (in the mock: the Berlin pin's position + arrange + marker-style sections). When nothing is selected, this pane shows "No selection" affordances + global document settings. The Move tool is therefore really "the selection tool".
2. **Every other tool pane** — *tool-defaults* panes. Open with a `.tool-header` block: 30 × 30 accent-soft badge holding the tool's rail icon · name (12.5 px / 600) · sub-line with a one-line description and a `<kbd>` shortcut chip. Then a small number of sections following the standard inspector vocabulary (`.section-head`, `.row`, `.input`, `.swatch-grid`, `.toggle`, `.size-slider`, `.select-pill`, plus the three new primitives below).

**Shared primitives introduced for tool panes.**

| Class | Use |
|---|---|
| `.tool-header` | Pane title block: badge + name + sub. Always the first child of a non-Move tool pane |
| `.seg-row` | Full-width segmented control (2–4 short choices). Active button is solid `--accent` with white text — the same accent fill we use for menu hover, on purpose. Use this for one-of-N choices where the chip labels are short ("New / Add / Subtract", "Map / Canvas", "Solid / Dashed / Dotted") |
| `.btn-grid` | A segmented row of icon-only buttons sharing one `--glass-thin` container. Used for alignment, text style (B / I / U), arrow head styles. Active is `--accent-soft` + `--accent` icon, **not** the solid accent — these are toggles within a set, not exclusive picks of a primary choice |
| `.stepper` | − / value / + numeric stepper, value in mono 11.5 px. Pairs with `.row` |
| `.hint-row` | A dashed-border `--glass-thin` block in 11.5 px `--text-3` for things like "Drop a PNG onto the canvas". Use this when a tool's primary affordance is the canvas itself and the inspector just needs to set context |

**Canonical pane contents** (kept lean — if a tool needs more than ~4 sections, you're putting selection-specific UI in a defaults pane and need to rethink).

- **Move** — selection card · Position (label / lat / lng) · Arrange (align grid, anchor seg, opacity) · Marker style
- **Marquee** — header · Mode (New / Add / Subtract) · Targets (Layers / Annotations / Locked toggles)
- **Pan** — header · hint · Viewport (zoom, center, bearing mono inputs)
- **Ruler** — header · Units (km / mi / nmi) · Measurement (from, to, distance)
- **Pen** — header · Stroke (color grid, width, dash, opacity) · Behavior (close path, snap to map)
- **Rectangle** — header · Fill · Stroke (color pill, width, dash) · Geometry (radius, anchor)
- **Ellipse** — header · Fill · Stroke (width, constrain toggle)
- **Polygon** — header · Shape (sides, geo-anchor) · Fill
- **Text** — header · Type (font, weight, size, align, style) · Color
- **Paint area** — header · Fill · Blend (mode, opacity, soft edge)
- **Pin** — header · Marker (color, size, style seg) · Label (show, position, pulse)
- **Arrow** — header · Head (3-icon grid) · Stroke (color, width, curve)
- **Image** — header · hint · Defaults (anchor seg, opacity, maintain ratio)
- **Legend** — header · Layout (direction, title, swatch) · Rows list
- **Comment** — header · hint pointing at the post-v1 roadmap · Thread (author, visibility)


**Tabs**

- Three tabs: Properties / Layers / Style, each with a 13 px icon + label
- Inactive tab: `--text-2`, transparent background; hovers to `--hover` + `--text`
- **Active tab**: `--accent-soft` background, `--accent` icon and text, weight 600, plus a 0.5 px `--accent-ring` outline and a faint inner top sheen. This must remain visibly distinct against the panel glass — it is the user's anchor for "where am I?".

**Body**

- Vertical flex with 16 px gaps between sections, scrollable, 6 px scrollbar
- Each tab maps to a `.pane[data-pane="…"]` element; non-active panes get the `hidden` attribute. Switching tabs is instant — no slide animation, because the surface itself is the constant.

#### 4.4.1 Properties pane

Shows context-aware controls for the current selection. In the mock, this is the Berlin pin:

1. **Selection card** — 32 px accent-soft badge with the layer-type icon, then name (`13 px / 600`) + mono coordinate sub-label
2. **Position section** — three rows under an eyebrow head: Label / Latitude / Longitude (`.input` and `.input.mono`)
3. **Marker style section**
   - Color: a 6-column `.swatch-grid` of accent + 5 semantic colors; active swatch gets a 2 px accent ring, hover scales 1.12
   - Size: `.size-slider` with a gradient fill and a white spring-thumb
   - Pulse / Show label: inline `.toggle` rows (36 × 20 pill, accent fill when on)

Row pattern is consistent: `grid-template-columns: 88px 1fr`, label on the left, control on the right.

#### 4.4.2 Layers pane

A Figma-style collapsible tree.

- **Toolbar** above the tree:
  - `.search` input with a magnifier glyph adornment (left, 8 px from edge, `--text-3`)
  - Two `.ghost-btn`s (sort + add-layer), 28 × 28 px, `--glass-thin` fill, hover brightens
- **Tree** container is `--glass-thin` with 4 px padding and 1 px row separation
- **Tree row** anatomy: chevron / icon / name / count / actions
  - 28 px tall, 6 px radius, 6 px gap
  - Hover: `--hover` wash; selected: `--accent-soft` + accent-tinted icon
  - Children sit in a `.tree-children` sibling that gets `hidden` toggled when the parent's chevron flips
  - Indent step: 22 px (`.indent-1`); leaf rows get `.no-chev` and a visibility-hidden chevron slot to keep alignment
  - The visibility / lock action buttons in `.actions` are `opacity: 0` by default and fade in on hover or when the row is selected — keeps the tree calm at rest
- **Groups in the mock**: Annotations (3), Embassies (7, with Berlin selected), Highlights (1, collapsed), Basemap (1)
- Special row: the Paris pin uses a star-shaped fill icon to mark it as the capital

#### 4.4.3 Style pane

Three sections:

1. **Basemap style** — a 2 × 2 `.style-grid` of `.style-card`s (Editorial Light, Editorial Dark, Minimal Grey, Print B&W)
   - Each card has a 16:9 inline-SVG mini map thumbnail driven by per-card CSS custom properties (`--c-water`, `--c-land`, `--c-line`, `--c-pin`). One SVG markup, four palette variants via `data-preset="…"` selectors
   - Active card: 2 px `--accent` outline + a soft accent shadow (`0 6px 16px rgba(0,122,255,0.18)`)
   - Hover: `translateY(-1px)` spring
2. **Map layers** — six `.toggle-row`s for Roads / Labels / Water / Landuse / Buildings / Boundaries, each with a 14 px icon and a `.toggle`. Section head shows a mono `5 / 6` count of enabled sublayers.
3. **Page** — three rows: Projection (`.select-pill`, "Web Mercator"), Paper size (`.select-pill`, "A4 · Landscape"), and Background (a 6-swatch grid including a checkerboard pattern for transparent)

The `.select-pill` is a read-only-looking button (28 px, `--glass-thin` background, label + chevron-down) used wherever a dropdown would go. In production these wire up to a real menu.

### 4.5 Status bar

- 28 px, mono 10.5 px, `--text-3`
- Left group: autosave dot (green with bloom) + projection + feature count
- Right group: live cursor coords + scale ratio + zoom level

---

## 5. Iconography

All icons are inline SVGs in the **Lucide** family (24 × 24 viewBox, `stroke-width: 1.8` by default, round caps and joins). Strokes inherit `currentColor` so they re-tint with the theme automatically.

Rendered sizes:
- Tool icons: 18 px
- Title-bar buttons: 16 px
- Tab icons: 13 px
- Tree-row, toggle-row, ghost-btn icons: 14 px
- Eye / lock action buttons: 13 px

For new icons: copy the path from [lucide.dev](https://lucide.dev), keep `fill="none" stroke="currentColor"`, drop in as inline SVG. Do **not** load an icon font. The one exception is the Paris-capital pin star, which uses `fill="currentColor"` instead of stroke.

---

## 6. The map illustration

The map in the mock is a **stylised hand-drawn SVG** of Europe — not a real basemap. This is intentional for the mock; production uses MapLibre + Protomaps PMTiles per the PRD. Conventions to keep when swapping for real tiles:

- Land fill: `var(--land)`, hairline stroke `var(--land-line)`, stroke-linejoin round, drop-shadow via a single `feDropShadow` filter on the land group (dy 1, stdDeviation 1.2, 10% opacity)
- Highlighted country: `var(--land-fr)` fill with a stronger `var(--land-fr-line)` stroke
- Graticule: 100-px grid, `var(--grid)` 0.5-px stroke
- Country labels: four only — FRANCE (focal, `--text-2`), ESPAÑA, DEUTSCHLAND, ITALIA. 9.5–10.5 px, +0.08em tracking, uppercase. The mock deliberately avoids cluttering with every label — sparse labels read more editorial.
- Sicily as the only secondary landmass — Sardinia, Corsica, Iceland and the Denmark satellite are all suppressed in this simplified version

### 6.1 Pins

```html
<g class="pin [capital] [selected]" transform="translate(x,y)">
  <circle class="pin-ring-sel" r="12"/>   <!-- only if selected -->
  <circle class="pin-pulse"    r="5"/>    <!-- pulse halo -->
  <circle class="pin-ring"     r="6.5"/>  <!-- white outer ring -->
  <circle class="pin-dot"      r="3.5"/>  <!-- accent dot -->
  <path   class="pin-star" .../>          <!-- only if capital -->
  <text class="pin-label" x="10" y="3">Berlin</text>
</g>
```

- Standard pin: ring r=5.5, dot r=3
- Capital pin: ring r=7, dot r=4, star centered (fill, not stroke)
- Selected pin: add a 1.5 px dashed accent ring (r=12) with `marching` animation (stroke-dashoffset to −12 over 1.2 s)
- Each pin animates in with a stagger via `animation-delay` (40 ms apart) for a controlled cascade
- Label uses SVG `paint-order: stroke` with a thick water-colored stroke to halo around the text — the editorial trick that keeps labels readable on any background
- Pin set in the mock: Paris (capital), London, Brussels, Berlin (selected), Madrid, Rome, Warsaw

### 6.1a Selection transformer

When a non-pin canvas object is selected, render a **Figma-style transformer** as SVG nested in the same group as the object so it shares its transform:

```html
<g class="transformer" transform="translate(x,y)">
  <rect class="tx-bbox" .../>             <!-- accent-tinted, marching-ants stroke -->
  <rect class="tx-handle" .../> × 8       <!-- 8×8, 4 corners + 4 edges -->
  <line class="tx-rot-line" .../>         <!-- short connector above top-center -->
  <circle class="tx-rot" .../>            <!-- 6 r rotate puck -->
  <path class="tx-rot-glyph" .../>        <!-- tiny return-arrow inside the puck -->
</g>
```

- bbox: `fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; stroke-dasharray: 4 3` + the existing `marching` keyframe (`stroke-dashoffset → -12`, 1.2 s linear infinite)
- handles: 8 × 8 px white squares (1.5 px radius), 1 px `--accent` stroke, drop-shadow `0 1px 2px rgba(0,0,0,0.18)` to lift them off the bbox. Positioned at `x - 4` / `y - 4` from the bbox's corners and midpoints
- rotate puck: 6 r circle centered 18 px above the top-middle handle, connected by a 1 px accent line. Glyph is a small return-arrow path in `--accent`, `stroke-width: 1.2`
- Dark theme: handles and puck swap fill from `white` to `#f5f5f7` to keep contrast against dark land

This is the same component pattern that will, in production, be rendered by Konva's `Transformer` over the canvas — see PRD §3. The SVG version in the mock exists to validate the visual language; the real implementation will sit on the Konva layer, not inside the basemap `<svg>`.

### 6.2 Callout / annotation

- Dashed leader line (`stroke-dasharray: 2 3`)
- Small filled dot at the leader root
- Glass box at the end (`var(--glass-strong)` + 0.5 px border + 4 px drop-shadow)
- Title in 11 px 600, sub in 10 px `--text-3`

---

## 6a. Menu popovers (shared component)

A single `.menu-popover` component backs **both** the system menu bar dropdowns (§4.0) and the right-click context menus (§6c). One markup pattern, one stylesheet, two anchoring strategies.

```html
<div class="menu-popover" role="menu" aria-label="…">
  <div class="menu-row">
    <span class="menu-ic">…optional icon…</span>
    <span class="menu-label">Save</span>
    <span class="menu-kbd">⌘S</span>
    <span class="menu-sub">…optional submenu chevron…</span>
  </div>
  <div class="menu-divider"></div>
  …
</div>
```

- Container: `position: fixed`, `min-width: 220`, `border-radius: 12`, `padding: 6`, `--glass-strong` + 30 px blur + 180% saturate, hairline + ambient shadow stack
- Row layout: `grid-template-columns: 16px 1fr auto 10px` (icon · label · kbd · submenu)
- Row height 26 px, 6 px radius. Hover paints the row with `--accent` and inverts text to `--text-on-accent` — this is the only place in the app where a hover state uses the saturated accent fill, on purpose: it matches macOS menus exactly
- `.menu-kbd` is `--font-mono` 10.5 px in `--text-3`. On hover it shifts to `rgba(255,255,255,0.85)` so it stays legible against the accent fill
- `.menu-divider` is a 0.5 px `--divider` rule with 4 px vertical margin and 6 px horizontal margin (so it doesn't touch the popover edge)
- `.is-disabled` rows drop to 0.45 opacity and ignore pointer events
- Entrance: opacity 0 → 1 + translate `-2px` → 0 + scale 0.985 → 1 over 160 ms ease-out
- Only **one** popover is open at any time. Opening another closes the first instantly (no animation)

**Positioning.**
- Menu bar dropdown: anchored at `(item.left, item.bottom + 4)`
- Context menu: anchored at `(event.clientX, event.clientY)`
- In both cases, after rendering the popover off-screen, measure with `getBoundingClientRect()` and clamp to the viewport with an 8 px margin on every edge — so right-clicking near the window edge never produces a clipped or scrolling menu

**Close on:** outside click, Escape, or selecting a row.

## 6b. Modals & sheets (export dialog)

The export modal is the canonical modal in this app — every future modal (preferences, import config, share) should reuse this skeleton.

- Backdrop: `.modal-backdrop`, `position: fixed; inset: 0;`, fills the **viewport** (not the window), so it lives outside the window's transformed containing block. Light theme: `rgba(10,20,40,0.32)` + `backdrop-filter: blur(8px) saturate(140%)`; dark: `rgba(0,0,0,0.5)` + same blur
- Sheet: `.modal`, centered via the backdrop's `display: grid; place-items: center;`. Width `min(680px, 100% - 48px)`, `border-radius: var(--radius-xl)` (28 px), `--glass-strong` + 40 px blur + 180% saturate, the same window-level multi-layer shadow as `.window` itself (so the sheet reads as a *floating* surface, not a flat overlay)
- Grid: `grid-template-rows: 48px 1fr 56px` — header / body / footer. Header has the title (14 px / 600) on the left and a 28 px close icon-button on the right. Footer has a `mono` meta string on the left and the action cluster on the right (secondary `Cancel` then primary `Export <FORMAT>`)
- Body is `grid-template-columns: 168px 1fr` — left rail of format tabs, right pane of options
- **Format tabs** (`.format-tab`): icon · label · status chip. Three chip variants reflect the PRD §5.4 phase: `.phase-1` (accent-soft), `.v1` (success-soft), `.roadmap` (warn-soft). Hovering paints `--hover`; active paints `--accent-soft` and tints the icon. **Do not** hide roadmap formats — show them with an empty-state pane so the user understands the trajectory
- **Per-format pane** (`.modal-pane[data-format-pane="…"]`): a 130 px preview SVG at top, then a stack of inspector-style rows (`grid-template-columns: 100px 1fr`). Segmented buttons (`.seg`) replace single-purpose pill dropdowns wherever a small enumerable choice fits
- Empty / roadmap pane: a centered `.roadmap-empty` block with a 14 px / 600 title and 12.5 px `--text-3` body pointing the reader at the relevant PRD section

**Motion.** Backdrop fades opacity 0 → 1 over 240 ms ease-out. Sheet `translateY(4px) scale(0.97)` → 0 / 1 over 240 ms spring. On close, both reverse simultaneously and the backdrop is `display: none`'d after the transition.

**Close on:** Escape, backdrop click (only when the click target is the backdrop itself, not the sheet), close X, or Cancel button. Primary action also closes and fires a toast confirming the action.

## 6c. Context menus

Triggered by `contextmenu` events. Two are wired in the mock:

- **Canvas context** — fires on right-click anywhere on `.canvas`. Items: Cut · Copy · Paste here · Duplicate · Delete · ─ · Lock · Hide · ─ · Pin to map · Pin to canvas · ─ · Bring to front · Send to back
- **Layer/tree context** — fires on right-click on any `.tree-row`. Items: Rename · Duplicate · Delete · ─ · Hide · Lock · ─ · Move to group ▸

Both use the same `.menu-popover` chrome (§6a). The only difference from menu-bar dropdowns is the anchor: cursor position, with the standard 8 px viewport-edge clamping.

## 6d. Toasts

Transient feedback for non-obvious results. **Not** for confirmations of obviously-visual changes (a swatch click is its own confirmation — though we do toast on it to make the mock feel chatty; in production, prefer silence).

- Container `.toast-stack`: absolutely positioned inside the window, `bottom: 44px; left: 50%; transform: translateX(-50%);`. New toasts append to the bottom of the column and stack upward (flex-column gap 6)
- Toast pill: `--glass-strong`, 999 px radius, 13 px label + optional 11.5 px `<em>` secondary phrase. Optional accent "Undo" link, always a close X
- Entrance: opacity 0 → 1 + translate-y 8 → 0 + scale 0.98 → 1 over 240 ms spring; exit reverses over 240 ms ease-out then DOM-removes
- Auto-dismiss after 3.5 s by default; pass `{ persistent: true }` for sticky errors, `{ duration: 1600 }` for very short confirmations
- Triggers in the mock: welcome on load, tool selection, swatch / preset change, snap toggle, export start, map-pin click. **Not** triggered: tab switches, theme toggle, simple toggle clicks already visible in-place

ARIA: container has `aria-live="polite"` so screen readers announce new toasts without interrupting.

## 7. Animations

| Element | Animation | Trigger |
|---|---|---|
| Window | Fade + 8 px translate-up + 0.992 → 1 scale | Page load (420 ms) |
| Panels (rail, inspector, canvas, title block, legend, zoom stack, scale bar) | Fade + 6 px translate-up | Page load, staggered 80–360 ms |
| Tool button | Scale 1.05 + bg wash | Hover (160 ms, spring) |
| Tool button | Scale 0.94 | Press (160 ms, spring) |
| Theme toggle | Sun/moon crossfade + 60° rotate | Click theme toggle (240 ms, spring) |
| Pin | Drop-in from −8 px Y + scale 0.6 → 1 | Page load, staggered per pin |
| Pin pulse halo | Scale 1 → 2.4, opacity 0.35 → 0 | Loop, 2.4 s, only on selected/capital |
| Selected dashed ring | `stroke-dashoffset` to −12 | Loop, 1.2 s linear |
| Tab switch | Background fade to `accent-soft`, color to `accent`, ring fades in | Click (160 ms) |
| Pane swap | Instant (no transition) | Tab click — content changes, surface stays |
| Tree chevron | `transform: rotate(90deg)` | Group expand (240 ms) |
| Tree action buttons | Opacity 0 → 1 | Row hover or selection (160 ms) |
| Style card | `translateY(-1px)` | Hover (160 ms, spring) |
| Slider thumb | Scale 1.1 | Hover (160 ms, spring) |
| Toggle | Thumb translateX 16 px | Click (240 ms, spring) |
| Swatch | Scale 1.12 | Hover (160 ms, spring) |
| Theme switch (global) | All color tokens crossfade | Toggle (420 ms, ease-out) |
| Menu popover (dropdown + context) | Opacity + 2 px translate-down + 0.985 → 1 scale | Open (160 ms, ease-out) |
| Modal backdrop | Opacity 0 → 1 | Open (240 ms, ease-out) |
| Modal sheet | Opacity + 4 px translate-up + 0.97 → 1 scale | Open (240 ms, spring) |
| Toast | Opacity + 8 px translate-up + 0.98 → 1 scale | Inject (240 ms, spring) |
| Toast (leaving) | Opacity 1 → 0 + 6 px translate-down + 1 → 0.98 scale | Dismiss (240 ms, ease-out) |
| Transformer bbox | `stroke-dashoffset` to −12 | Loop, 1.2 s linear (same as selected pin) |
| Inspector tool-pane swap | Instant `hidden` toggle on `.tool-pane` + auto-activate Properties tab | Tool change — chrome is the constant |

The global token crossfade is achieved by putting `transition: background-color var(--t-slow) var(--ease-out), color var(--t-slow) var(--ease-out)` on `body`, then letting each component opt in to its own transitions on specific properties (`background`, `box-shadow`, `fill`, `stroke`, etc.).

**Reduced-motion.** Not implemented in the mock. For production, wrap all keyframe loops and entrance animations in `@media (prefers-reduced-motion: no-preference)`. Keep state-feedback transitions (hover, focus, press) — those help everyone.

---

## 8. Theme switching

```js
const root = document.documentElement;
const KEY = "geocarto-theme";

// Defensive against sandboxed iframes where localStorage throws.
const safeGet = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const safeSet = v => { try { localStorage.setItem(KEY, v); } catch {} };

// On load: stored preference > system preference > fallback to attribute in HTML.
const saved = safeGet();
if (saved) root.setAttribute("data-theme", saved);
else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
  root.setAttribute("data-theme", "dark");
}

// On toggle click:
root.setAttribute("data-theme", next);
safeSet(next);
```

Always wrap `localStorage` in try/catch. Preview panels, sandboxed iframes, and locked-down browser modes throw on the bare call, and that error otherwise prevents the click handler from ever registering — the toggle would appear inert.

---

## 9. Accessibility notes

- Color contrast: all primary text (`--text` on `--glass-strong`) clears WCAG AA in both themes. `--text-3` is intentionally low-contrast (it's for non-essential meta) — never use it for actionable copy.
- Focus rings: inputs get a 3 px `accent-ring` glow. Buttons currently rely on hover wash; add a visible `:focus-visible` ring before shipping.
- ARIA: window has `role="application"`, tool-rail has `aria-label="Tools"`, tabs use `role="tablist"` + `role="tab"` + `aria-selected`, tree groups use `role="treeitem"` + `aria-expanded`, toggles use `role="switch"` + `aria-checked`.
- New surfaces: system menu bar uses `role="menubar"` + per-item `role="menuitem"`; popovers use `role="menu"`; the export modal uses `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the title node; the toast stack uses `aria-live="polite"` so new toasts are announced without interrupting.
- Keyboard: not fully wired in the mock. Escape closes the active popover **or** the open modal. In production, tools bind to `V M H K P R O G T B I A J L C` (matching tooltip kbd hints), arrow keys navigate menu rows and the tree, Cmd/Ctrl+Z undo, Cmd/Ctrl+E opens export.

---

## 10. Reproduction checklist

To recreate any new screen in this language:

1. Use the `body { background: var(--wallpaper) }` and stage-center the window.
2. Wrap content in a single rounded container with the window-level shadow and `backdrop-filter: blur(40px) saturate(180%)`.
3. Every floating sub-panel uses the four-layer glass recipe in §3.
4. Stick to 13 px / SF stack for UI, mono for any number.
5. One accent color, never two. Use `--accent-soft` for tints (active tab, selected row) and the saturated `--accent` for icons + text on those tints, never as a second hue elsewhere.
6. Radii descend with nesting: 14 → 10 → 8 → 6.
7. Spring on tactile feedback, ease-out on everything else. 160 / 240 / 420 ms — pick one.
8. Map content lives behind a hairline-bordered, rounded canvas, and overlays attach to its corners.
9. Tab-style panels use `[data-pane]` on both the tab and the pane; switch by toggling the `hidden` attribute on panes — no slide animation, the chrome is the constant.
10. Action affordances (eye, lock, more) inside list rows start at `opacity: 0` and fade in on row hover or selection — keep lists quiet at rest.
11. Test light AND dark before declaring done; tokens make this cheap.
12. **Popovers, modals, and any overlay anchored to the viewport go at `<body>` level, not inside `.window`** — the window's entrance `transform` creates a containing block that breaks `position: fixed` anchoring (§4.0a). Only chrome that should travel with the window's entrance animation (toast stack, canvas overlays) lives inside.

---

## 11. File map

| File | Purpose |
|---|---|
| `mock.html` | The single-file UI mock. Open in any modern browser. |
| `design.md` | This document. |
| `PRD.md` | Product requirements doc that informs what the UI must support. |

When the real app is scaffolded (per `PRD.md` §8), these tokens move into `/src/ui/tokens.css` and the layout primitives become React components under `/src/ui/`. The pane / tab / tree / preset-card patterns each become small, self-contained components driven by the same data shapes implied here.
