import type { CalqoProject, LocaleCode } from '@/lib/schema';

/**
 * AN-0.5.1 representative spike fixtures. Five animated projects covering the
 * fidelity/perf risk surface, each parameterizable by output resolution and
 * duration so the harness can sweep 1080×1080 / 1080×1920 at 5 s / 15 s / 60 s.
 *
 * These are intentionally small and free of third-party content. The
 * "photo-heavy" fixture references a tiny embedded placeholder PNG; swap in a
 * real licensed photo locally for photo-quality banding review (plan §14.2 —
 * licensed photo fixtures stay local, not committed).
 */

type Layer = CalqoProject['artboards'][number]['layers'][number];

export interface SpikeBuildOpts {
  width: number;
  height: number;
  durationMs: number;
}

export interface SpikeFixture {
  id: string;
  label: string;
  kind: 'flat-vector' | 'photo' | 'groups' | 'effects' | 'multilingual';
  contentLocales: LocaleCode[];
  /** Build a valid, animated project at the requested output size/duration. */
  build(opts: SpikeBuildOpts): CalqoProject;
}

const ISO = '2026-07-19T00:00:00.000Z';

/** 2×2 opaque PNG (base64), a stand-in for a real photo asset. */
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAwkAP9lF4z3QAAAABJRU5ErkJggg==';

/** assetId → data URL, so the harness `loadAsset` can resolve fixture images
 * without touching storage adapters. */
export const spikeAssetDataUrls: Record<string, string> = {
  spike_photo: TINY_PNG_DATA_URL,
};

const textStyle = (over: Record<string, unknown> = {}) => ({
  fontFamily: 'Inter',
  fontSize: 72,
  fontWeight: 700,
  fontStyle: 'normal' as const,
  textDecoration: 'none' as const,
  color: '#111111',
  align: 'left' as const,
  lineHeight: 1.15,
  letterSpacing: 0,
  ...over,
});

const layer = (over: Record<string, unknown>): Layer =>
  ({
    x: 80,
    y: 80,
    w: 400,
    h: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    ...over,
  }) as Layer;

function project(
  base: {
    id: string;
    name: string;
    locales: LocaleCode[];
    assets?: CalqoProject['assets'];
  },
  opts: SpikeBuildOpts,
  layers: Layer[],
): CalqoProject {
  return {
    schemaVersion: 2,
    id: `${base.id}_${opts.width}x${opts.height}_${opts.durationMs}`,
    name: base.name,
    createdAt: ISO,
    updatedAt: ISO,
    contentLocales: base.locales,
    activeContentLocale: base.locales[0],
    palette: [],
    assets: base.assets ?? [],
    glossary: [],
    clipSettings: { fps: 30 },
    artboards: [
      {
        id: 'ab',
        name: 'Scene',
        preset: opts.width === opts.height ? 'ig-square' : 'story',
        width: opts.width,
        height: opts.height,
        background: {
          type: 'linear',
          angle: 90,
          stops: [
            { offset: 0, color: '#0A2540' },
            { offset: 1, color: '#123a63' },
          ],
        },
        timing: { duration: opts.durationMs },
        layers,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Flat vector brand card — shapes, gradients, flat colours, staggered text.
// ---------------------------------------------------------------------------
const flatVector: SpikeFixture = {
  id: 'flat-vector',
  label: 'Flat vector brand card',
  kind: 'flat-vector',
  contentLocales: ['en'],
  build: (o) =>
    project({ id: 'spike_flat', name: 'Brand card', locales: ['en'] }, o, [
      layer({
        id: 'bar',
        name: 'Accent bar',
        type: 'shape',
        shape: 'rect',
        x: 80,
        y: 80,
        w: 240,
        h: 16,
        fill: { type: 'solid', color: '#E8B339' },
        cornerRadius: 8,
        animation: { mode: 'preset', enter: { kind: 'slide', duration: 500, delay: 0, direction: 'right', distance: 200 } },
      }),
      layer({
        id: 'title',
        name: 'Title',
        type: 'text',
        x: 80,
        y: 140,
        w: o.width - 160,
        h: 240,
        text: { en: 'Launch day' },
        style: textStyle({ fontSize: 128, color: '#FFFFFF' }),
        animation: {
          mode: 'preset',
          enter: { kind: 'rise', duration: 600, delay: 100, direction: 'up', distance: 80 },
          exit: { kind: 'fade', duration: 400, delay: 0 },
        },
      }),
      layer({
        id: 'dot',
        name: 'Dot',
        type: 'shape',
        shape: 'ellipse',
        x: o.width - 320,
        y: o.height - 320,
        w: 220,
        h: 220,
        fill: { type: 'radial', stops: [{ offset: 0, color: '#E8B339' }, { offset: 1, color: '#b8801f' }] },
        animation: { mode: 'preset', emphasis: { kind: 'pulse', duration: 1200, delay: 0 } },
      }),
    ]),
};

// ---------------------------------------------------------------------------
// 2. Photo-heavy story — image with a slow scale (ken-burns), text overlay.
// ---------------------------------------------------------------------------
const photoStory: SpikeFixture = {
  id: 'photo',
  label: 'Photo-heavy story',
  kind: 'photo',
  contentLocales: ['en'],
  build: (o) =>
    project(
      {
        id: 'spike_photo_story',
        name: 'Photo story',
        locales: ['en'],
        assets: [
          {
            id: 'spike_photo',
            kind: 'raster',
            name: 'placeholder',
            mimeType: 'image/png',
            width: 2,
            height: 2,
            storageKey: 'spike_photo',
            createdAt: ISO,
          },
        ],
      },
      o,
      [
        layer({
          id: 'photo',
          name: 'Photo',
          type: 'image',
          x: 0,
          y: 0,
          w: o.width,
          h: o.height,
          assetId: 'spike_photo',
          fit: 'cover',
          animation: {
            mode: 'custom',
            windows: [
              {
                start: 0,
                duration: o.durationMs,
                tracks: [
                  { prop: 'scaleX', keyframes: [{ t: 0, value: 1 }, { t: 1, value: 1.15, easing: 'ease-in-out' }] },
                  { prop: 'scaleY', keyframes: [{ t: 0, value: 1 }, { t: 1, value: 1.15, easing: 'ease-in-out' }] },
                ],
              },
            ],
          },
        }),
        layer({
          id: 'caption',
          name: 'Caption',
          type: 'text',
          x: 80,
          y: o.height - 320,
          w: o.width - 160,
          h: 220,
          text: { en: 'Golden hour' },
          style: textStyle({ fontSize: 96, color: '#FFFFFF' }),
          animation: { mode: 'preset', enter: { kind: 'slide', duration: 600, delay: 300, direction: 'up', distance: 120 } },
        }),
      ],
    ),
};

// ---------------------------------------------------------------------------
// 3. Nested groups — parent animation plus animated children (rotated child).
// ---------------------------------------------------------------------------
const nestedGroups: SpikeFixture = {
  id: 'groups',
  label: 'Nested groups',
  kind: 'groups',
  contentLocales: ['en'],
  build: (o) =>
    project({ id: 'spike_groups', name: 'Nested groups', locales: ['en'] }, o, [
      {
        ...layer({ id: 'grp', name: 'Card', type: 'group', x: 120, y: 200, w: o.width - 240, h: 600 }),
        animation: { mode: 'preset', enter: { kind: 'pop', duration: 500, delay: 0 } },
        children: [
          layer({
            id: 'card-bg',
            name: 'Card bg',
            type: 'shape',
            shape: 'rect',
            x: 120,
            y: 200,
            w: o.width - 240,
            h: 600,
            fill: { type: 'solid', color: '#FFFFFF' },
            cornerRadius: 32,
          }),
          layer({
            id: 'card-title',
            name: 'Card title',
            type: 'text',
            x: 180,
            y: 260,
            w: o.width - 360,
            h: 160,
            rotation: -4,
            text: { en: 'Nested' },
            style: textStyle({ fontSize: 88 }),
            animation: { mode: 'preset', enter: { kind: 'slide', duration: 500, delay: 250, direction: 'left', distance: 80 } },
          }),
        ],
      } as Layer,
    ]),
};

// ---------------------------------------------------------------------------
// 4. Creative effects/masks/frames — masked+framed image, filters, sticker,
//    expressive stroke; blur-in + wipe reveals.
// ---------------------------------------------------------------------------
const effects: SpikeFixture = {
  id: 'effects',
  label: 'Effects / masks / frames',
  kind: 'effects',
  contentLocales: ['en'],
  build: (o) =>
    project(
      {
        id: 'spike_effects',
        name: 'Effects',
        locales: ['en'],
        assets: [
          {
            id: 'spike_photo',
            kind: 'raster',
            name: 'placeholder',
            mimeType: 'image/png',
            width: 2,
            height: 2,
            storageKey: 'spike_photo',
            createdAt: ISO,
          },
        ],
      },
      o,
      [
        layer({
          id: 'framed',
          name: 'Framed photo',
          type: 'image',
          x: 120,
          y: 160,
          w: o.width - 240,
          h: Math.round(o.height * 0.5),
          assetId: 'spike_photo',
          fit: 'cover',
          mask: { shape: 'rounded', radius: 48 },
          frame: { kind: 'polaroid', color: '#FFFFFF', width: 24, padding: 16 },
          filters: { brightness: 1.05, contrast: 1.1, saturation: 1.2 },
          sticker: { color: '#FFFFFF', width: 12 },
          animation: { mode: 'preset', enter: { kind: 'blur-in', duration: 700, delay: 0 } },
        }),
        layer({
          id: 'stroke-shape',
          name: 'Sketchy underline',
          type: 'shape',
          shape: 'line',
          x: 120,
          y: o.height - 260,
          w: o.width - 240,
          h: 12,
          points: [0, 0, o.width - 240, 0],
          fill: { type: 'solid', color: 'transparent' },
          stroke: { color: '#E8B339', width: 14, look: 'sketch', intensity: 0.8 },
          animation: { mode: 'preset', enter: { kind: 'wipe', duration: 700, delay: 300, direction: 'left' } },
        }),
      ],
    ),
};

// ---------------------------------------------------------------------------
// 5. Multilingual text with a webfont — different wrapping per locale, a list.
// ---------------------------------------------------------------------------
const multilingual: SpikeFixture = {
  id: 'multilingual',
  label: 'Multilingual text + webfont',
  kind: 'multilingual',
  contentLocales: ['en', 'fr'],
  build: (o) =>
    project({ id: 'spike_i18n', name: 'Multilingual', locales: ['en', 'fr'] }, o, [
      layer({
        id: 'headline',
        name: 'Headline',
        type: 'text',
        x: 80,
        y: 120,
        w: o.width - 160,
        h: 300,
        text: {
          en: 'Fresh ideas, every week',
          fr: 'Des idées fraîches, chaque semaine',
        },
        // A webfont family the harness loads before compiling (font-load
        // revision drives cache invalidation — plan §8).
        style: textStyle({ fontFamily: 'Noto Sans', fontSize: 96, color: '#FFFFFF' }),
        animation: { mode: 'preset', enter: { kind: 'fade', duration: 500, delay: 0 }, exit: { kind: 'fade', duration: 400, delay: 0 } },
      }),
      layer({
        id: 'points',
        name: 'Points',
        type: 'list',
        x: 80,
        y: o.height - 520,
        w: o.width - 160,
        h: 400,
        items: [
          { id: 'p1', text: { en: 'Local-first', fr: 'Local d’abord' } },
          { id: 'p2', text: { en: 'Multilingual', fr: 'Multilingue' } },
          { id: 'p3', text: { en: 'Open source', fr: 'Libre' } },
        ],
        marker: { kind: 'bullet', color: '#E8B339' },
        markerGap: 12,
        style: textStyle({ fontFamily: 'Noto Sans', fontSize: 56, color: '#FFFFFF' }),
        animation: { mode: 'preset', enter: { kind: 'slide', duration: 500, delay: 200, direction: 'up', distance: 100 } },
      }),
    ]),
};

export function defaultSpikeFixtures(): SpikeFixture[] {
  return [flatVector, photoStory, nestedGroups, effects, multilingual];
}
