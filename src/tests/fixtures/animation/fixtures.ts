import type { CalqoProject } from '@/lib/schema';

/**
 * Permanent animation fixture set (plan §14.2). These are small, self-contained,
 * and free of third-party content so they can live in the repo. They cover:
 * a frozen v1 document for migration, a static v2 project, a preset-animated
 * project exercising every v1 preset, a custom-track project at the validation
 * boundaries, and nested-group parent+child animation.
 */

const ISO = '2026-07-19T00:00:00.000Z';

const baseLayer = (over: Record<string, unknown>) => ({
  x: 0,
  y: 0,
  w: 200,
  h: 120,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  ...over,
});

const textStyle = {
  fontFamily: 'Inter',
  fontSize: 48,
  fontWeight: 700,
  fontStyle: 'normal',
  textDecoration: 'none',
  color: '#111111',
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
} as const;

// ---------------------------------------------------------------------------
// v1 — a frozen legacy document (schemaVersion 1) for the migration path.
// Nested groups, an asset, all core layer kinds, and multiple locales.
// Typed as `unknown` on purpose: it must NOT satisfy the current (v2) type.
// ---------------------------------------------------------------------------

export const v1StaticDocument: unknown = {
  schemaVersion: 1,
  id: 'proj_v1',
  name: 'Legacy multi-kind',
  createdAt: ISO,
  updatedAt: ISO,
  contentLocales: ['en', 'fr'],
  activeContentLocale: 'en',
  palette: ['#0A2540', '#FFFFFF'],
  assets: [
    {
      id: 'asset_img',
      kind: 'raster',
      name: 'photo',
      mimeType: 'image/png',
      storageKey: 'sk_img',
      createdAt: ISO,
    },
    {
      id: 'asset_svg',
      kind: 'svg',
      name: 'logo',
      mimeType: 'image/svg+xml',
      storageKey: 'sk_svg',
      createdAt: ISO,
    },
  ],
  glossary: [],
  artboards: [
    {
      id: 'ab_v1',
      name: 'Square',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#FFFFFF' },
      layers: [
        baseLayer({
          id: 'txt',
          name: 'Title',
          type: 'text',
          text: { en: 'Hello', fr: 'Bonjour' },
          style: textStyle,
        }),
        baseLayer({
          id: 'rect',
          name: 'Block',
          type: 'shape',
          shape: 'rect',
          fill: { type: 'solid', color: '#E8B339' },
        }),
        baseLayer({
          id: 'list',
          name: 'Bullets',
          type: 'list',
          items: [
            { id: 'li1', text: { en: 'One', fr: 'Un' } },
            { id: 'li2', text: { en: 'Two', fr: 'Deux' } },
          ],
          marker: { kind: 'bullet', color: '#111827' },
          markerGap: 8,
          style: textStyle,
        }),
        {
          ...baseLayer({
            id: 'grp',
            name: 'Group',
            type: 'group',
          }),
          children: [
            baseLayer({
              id: 'img',
              name: 'Photo',
              type: 'image',
              assetId: 'asset_img',
              fit: 'cover',
            }),
            baseLayer({
              id: 'svg',
              name: 'Logo',
              type: 'svg',
              assetId: 'asset_svg',
            }),
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// v2 — static (no animation fields at all).
// ---------------------------------------------------------------------------

export const v2StaticProject: CalqoProject = {
  schemaVersion: 2,
  id: 'proj_v2_static',
  name: 'Static v2',
  createdAt: ISO,
  updatedAt: ISO,
  contentLocales: ['en'],
  activeContentLocale: 'en',
  palette: [],
  assets: [],
  glossary: [],
  artboards: [
    {
      id: 'ab',
      name: 'Square',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#FFFFFF' },
      layers: [
        {
          ...baseLayer({ id: 's', name: 'Block', type: 'shape', shape: 'rect' }),
          fill: { type: 'solid', color: '#000000' },
        } as CalqoProject['artboards'][number]['layers'][number],
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// v2 — every v1 preset (fade/slide/pop/rise/wipe/blur-in enter+exit;
// pulse/wiggle/float emphasis). Scene is long enough for enter+exit+hold.
// ---------------------------------------------------------------------------

const presetShape = (
  id: string,
  animation: CalqoProject['artboards'][number]['layers'][number]['animation'],
) =>
  ({
    ...baseLayer({ id, name: id, type: 'shape', shape: 'rect' }),
    fill: { type: 'solid', color: '#3366FF' },
    animation,
  }) as CalqoProject['artboards'][number]['layers'][number];

export const v2AllPresetsProject: CalqoProject = {
  schemaVersion: 2,
  id: 'proj_v2_presets',
  name: 'All presets',
  createdAt: ISO,
  updatedAt: ISO,
  contentLocales: ['en'],
  activeContentLocale: 'en',
  palette: [],
  assets: [],
  glossary: [],
  clipSettings: { fps: 30 },
  artboards: [
    {
      id: 'ab',
      name: 'Square',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#FFFFFF' },
      timing: { duration: 6000 },
      layers: [
        presetShape('fade', {
          mode: 'preset',
          enter: { kind: 'fade', duration: 500, delay: 0 },
          exit: { kind: 'fade', duration: 500, delay: 0 },
        }),
        presetShape('slide', {
          mode: 'preset',
          enter: { kind: 'slide', duration: 500, delay: 0, direction: 'up', distance: 120 },
          exit: { kind: 'slide', duration: 500, delay: 0, direction: 'down', distance: 120 },
        }),
        presetShape('pop', {
          mode: 'preset',
          enter: { kind: 'pop', duration: 500, delay: 0 },
          exit: { kind: 'pop', duration: 500, delay: 0 },
        }),
        presetShape('rise', {
          mode: 'preset',
          enter: { kind: 'rise', duration: 500, delay: 0, direction: 'up', distance: 80 },
          exit: { kind: 'rise', duration: 500, delay: 0, direction: 'up', distance: 80 },
        }),
        presetShape('wipe', {
          mode: 'preset',
          enter: { kind: 'wipe', duration: 500, delay: 0, direction: 'left' },
          exit: { kind: 'wipe', duration: 500, delay: 0, direction: 'right' },
        }),
        presetShape('blur', {
          mode: 'preset',
          enter: { kind: 'blur-in', duration: 500, delay: 0 },
          exit: { kind: 'blur-in', duration: 500, delay: 0 },
        }),
        presetShape('pulse', {
          mode: 'preset',
          emphasis: { kind: 'pulse', duration: 900, delay: 0 },
        }),
        presetShape('wiggle', {
          mode: 'preset',
          emphasis: { kind: 'wiggle', duration: 700, delay: 0 },
        }),
        presetShape('float', {
          mode: 'preset',
          emphasis: { kind: 'float', duration: 2000, delay: 0, distance: 16 },
        }),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// v2 — custom tracks at the validation boundaries (min/max caps, t at 0 and 1,
// a window that fills the scene exactly).
// ---------------------------------------------------------------------------

export const v2CustomBoundaryProject: CalqoProject = {
  schemaVersion: 2,
  id: 'proj_v2_custom',
  name: 'Custom boundaries',
  createdAt: ISO,
  updatedAt: ISO,
  contentLocales: ['en'],
  activeContentLocale: 'en',
  palette: [],
  assets: [],
  glossary: [],
  artboards: [
    {
      id: 'ab',
      name: 'Square',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#FFFFFF' },
      timing: { duration: 4000 },
      layers: [
        {
          ...baseLayer({ id: 'c', name: 'Custom', type: 'shape', shape: 'rect' }),
          fill: { type: 'solid', color: '#000000' },
          animation: {
            mode: 'custom',
            windows: [
              {
                start: 0,
                duration: 4000, // fills the scene exactly
                tracks: [
                  { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] },
                  { prop: 'scaleX', keyframes: [{ t: 0, value: 0.01 }, { t: 1, value: 10 }] },
                  { prop: 'blur', keyframes: [{ t: 0, value: 200 }, { t: 1, value: 0 }] },
                  { prop: 'rotation', keyframes: [{ t: 0, value: -3600 }, { t: 1, value: 3600 }] },
                  { prop: 'dx', keyframes: [{ t: 0, value: -10000 }, { t: 1, value: 10000 }] },
                  { prop: 'wipe-progress', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] },
                ],
              },
            ],
          },
        } as CalqoProject['artboards'][number]['layers'][number],
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// v2 — nested group with parent animation and an animated child.
// ---------------------------------------------------------------------------

export const v2NestedGroupProject: CalqoProject = {
  schemaVersion: 2,
  id: 'proj_v2_group',
  name: 'Nested group animation',
  createdAt: ISO,
  updatedAt: ISO,
  contentLocales: ['en'],
  activeContentLocale: 'en',
  palette: [],
  assets: [],
  glossary: [],
  artboards: [
    {
      id: 'ab',
      name: 'Square',
      preset: 'ig-square',
      width: 1080,
      height: 1080,
      background: { type: 'solid', color: '#FFFFFF' },
      timing: { duration: 4000 },
      layers: [
        {
          ...baseLayer({ id: 'grp', name: 'Group', type: 'group' }),
          animation: { mode: 'preset', enter: { kind: 'fade', duration: 400, delay: 0 } },
          children: [
            {
              ...baseLayer({ id: 'child-text', name: 'Child', type: 'text' }),
              text: { en: 'Inside' },
              style: textStyle,
              animation: {
                mode: 'preset',
                enter: { kind: 'slide', duration: 400, delay: 200, direction: 'up', distance: 60 },
              },
            },
          ],
        } as CalqoProject['artboards'][number]['layers'][number],
      ],
    },
  ],
};

export const allV2Fixtures: CalqoProject[] = [
  v2StaticProject,
  v2AllPresetsProject,
  v2CustomBoundaryProject,
  v2NestedGroupProject,
];
