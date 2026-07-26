import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalqoArtboard, CalqoLayer, CalqoProject } from '@/lib/schema';

const adapterMocks = vi.hoisted(() => ({
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    getAssetMeta: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
  dialog: { confirm: vi.fn() },
  storage: {
    saveProject: vi.fn(),
    getProject: vi.fn(),
    deleteProject: vi.fn(),
    listProjects: vi.fn(),
  },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

import {
  analyzeHtmlFidelity,
  exportArtboardHtmlLayout,
  rasterReasonForLayer,
} from '@/editor/export/htmlLayoutExport';
import { fillToCss, textStyleToCss } from '@/editor/export/styleConversions';
import { embeddedFontCss } from '@/editor/export/portableFonts';

const baseLayer = {
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
};

function textLayer(): CalqoLayer {
  return {
    ...baseLayer,
    id: 'text-1',
    name: 'Headline',
    type: 'text',
    x: 40,
    y: 60,
    w: 600,
    h: 120,
    rotation: 10,
    text: { en: 'Hello <world>', fr: 'Bonjour' },
    style: {
      fontFamily: 'Inter',
      fontSize: 64,
      fontWeight: 800,
      fontStyle: 'normal',
      textDecoration: 'none',
      color: '#0A2540',
      align: 'center',
      lineHeight: 1.1,
      letterSpacing: 1,
    },
  };
}

function artboard(layers: CalqoLayer[]): CalqoArtboard {
  return {
    id: 'ab-1',
    name: 'Card',
    preset: 'ig-square',
    width: 1080,
    height: 1080,
    background: {
      type: 'linear',
      angle: 0,
      stops: [
        { offset: 0, color: '#111111' },
        { offset: 1, color: '#222222' },
      ],
    },
    layers,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  adapterMocks.assetStorage.getAssetBlob.mockResolvedValue(
    new Blob(['img-bytes'], { type: 'image/png' }),
  );
});

describe('exportArtboardHtmlLayout', () => {
  it('emits real, escaped text nodes with absolute geometry and rotation', async () => {
    const { html } = await exportArtboardHtmlLayout(artboard([textLayer()]), 'en');
    expect(html).toContain('Hello &lt;world&gt;');
    expect(html).toContain('left:40px;top:60px;width:600px;height:120px');
    expect(html).toContain('transform:rotate(10deg)');
    expect(html).toContain('font-size:64px');
    expect(html).toContain('text-align:center');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const node = parsed.querySelector<HTMLElement>('[data-layer="Headline"]');
    expect(node?.style.fontFamily).toContain('Inter');
    expect(node?.style.fontSize).toBe('64px');
    // The document background converts to a CSS gradient.
    expect(html).toContain('linear-gradient(90deg, #111111 0%, #222222 100%)');
  });

  it('emits one file per locale content: the requested locale wins', async () => {
    const en = await exportArtboardHtmlLayout(artboard([textLayer()]), 'en');
    const fr = await exportArtboardHtmlLayout(artboard([textLayer()]), 'fr');
    expect(en.html).toContain('Hello');
    expect(fr.html).toContain('Bonjour');
    expect(fr.html).not.toContain('Hello &lt;world&gt;');
  });

  it('converts solid/gradient rects and ellipses to CSS divs', async () => {
    const rect: CalqoLayer = {
      ...baseLayer,
      id: 's1',
      name: 'Panel',
      type: 'shape',
      shape: 'rect',
      x: 10,
      y: 10,
      w: 200,
      h: 100,
      cornerRadius: 16,
      fill: {
        type: 'linear',
        angle: 0,
        stops: [
          { offset: 0, color: '#FF0000' },
          { offset: 1, color: '#0000FF' },
        ],
      },
    };
    const { html, warnings } = await exportArtboardHtmlLayout(artboard([rect]), 'en');
    expect(html).toContain('background:linear-gradient(90deg, #FF0000 0%, #0000FF 100%)');
    expect(html).toContain('border-radius:16px');
    // Gradient fills are faithful in HTML — no flattening warning.
    expect(warnings.join(' ')).not.toContain('flat colour');
  });

  it('keeps stroked shapes as inline SVG so centred strokes stay exact', async () => {
    const stroked: CalqoLayer = {
      ...baseLayer,
      id: 's2',
      name: 'Frame',
      type: 'shape',
      shape: 'rect',
      x: 5,
      y: 5,
      w: 50,
      h: 50,
      fill: { type: 'solid', color: 'transparent' },
      stroke: { color: '#00FF00', width: 4 },
    };
    const { html } = await exportArtboardHtmlLayout(artboard([stroked]), 'en');
    expect(html).toContain('<svg data-layer="Frame"');
    expect(html).toContain('stroke="#00FF00"');
  });

  it('embeds images as data-URI <img> with object-fit and focal point', async () => {
    const image: CalqoLayer = {
      ...baseLayer,
      id: 'i1',
      name: 'Photo',
      type: 'image',
      x: 0,
      y: 0,
      w: 300,
      h: 200,
      assetId: 'asset-1',
      fit: 'cover',
      focalPoint: { x: 0.25, y: 0.75 },
      mask: { shape: 'rounded', radius: 12 },
    };
    const { html } = await exportArtboardHtmlLayout(artboard([image]), 'en');
    expect(html).toContain('src="data:image/png;base64');
    expect(html).toContain('object-fit:cover');
    expect(html).toContain('object-position:25% 75%');
    expect(html).toContain('border-radius:12px');
  });

  it('rasterizes unsupported layers through the fallback with a grouped warning', async () => {
    const masked: CalqoLayer = {
      ...baseLayer,
      id: 'i2',
      name: 'Star photo',
      type: 'image',
      x: 0,
      y: 0,
      w: 300,
      h: 300,
      assetId: 'asset-1',
      fit: 'cover',
      mask: { shape: 'star' },
    };
    const rasterizeLayer = vi.fn().mockResolvedValue('data:image/png;base64,RASTER');
    const { html, warnings } = await exportArtboardHtmlLayout(
      artboard([masked]),
      'en',
      { rasterizeLayer },
    );
    expect(rasterizeLayer).toHaveBeenCalledTimes(1);
    // The export locale reaches the fallback rasterizer, so rasterized layers
    // containing text render the right language in multi-locale batches.
    expect(rasterizeLayer).toHaveBeenCalledWith(masked, expect.anything(), 'en');
    expect(html).toContain('data-rasterized="mask"');
    expect(html).toContain('data:image/png;base64,RASTER');
    expect(
      warnings.some((warning) => warning.layerName === 'Star photo' && warning.reason === 'mask'),
    ).toBe(true);
  });

  it('always names the font caveat and never loses fidelity silently', async () => {
    const { warnings } = await exportArtboardHtmlLayout(artboard([textLayer()]), 'en');
    expect(warnings.some((warning) => warning.code === 'fontFallback')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AN-3.2 — animated HTML export
// ---------------------------------------------------------------------------

function projectWith(ab: CalqoArtboard): CalqoProject {
  return {
    schemaVersion: 2,
    id: 'proj-anim',
    name: 'Anim',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    contentLocales: ['en'],
    activeContentLocale: 'en',
    palette: [],
    assets: [],
    glossary: [],
    clipSettings: { fps: 30 },
    artboards: [ab],
  };
}

function animatedTextLayer(): CalqoLayer {
  return {
    ...textLayer(),
    id: 'text-1',
    rotation: 0,
    animation: { mode: 'preset', enter: { kind: 'fade', duration: 500, delay: 0 } },
  } as CalqoLayer;
}

describe('exportArtboardHtmlLayout — animation (AN-3.2)', () => {
  it('leaves static structure unchanged when no project is supplied', async () => {
    const { html } = await exportArtboardHtmlLayout(artboard([animatedTextLayer()]), 'en');
    expect(html).not.toContain('@keyframes');
    expect(html).not.toContain('data-calqo-layer-id');
  });

  it('wraps animated layers and injects reduced-motion-gated keyframes', async () => {
    const ab = { ...artboard([animatedTextLayer()]), timing: { duration: 2000 } };
    const { html } = await exportArtboardHtmlLayout(ab, 'en', {
      project: projectWith(ab),
    });
    expect(html).toContain('data-calqo-layer-id="text-1"');
    expect(html).toContain('@keyframes calqo-a');
    expect(html).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(html).toContain('data-calqo-artboard-id="ab-1"');
    // The wrapper class the layer is tagged with also names its keyframes.
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const wrapper = parsed.querySelector<HTMLElement>('[data-calqo-layer-id="text-1"]');
    expect(wrapper).not.toBeNull();
    const cls = [...(wrapper?.classList ?? [])][0];
    expect(cls).toMatch(/^calqo-a/);
    expect(html).toContain(`@keyframes ${cls}`);
  });

  it('emits a snippet with scoped style and no document shell', async () => {
    const ab = { ...artboard([animatedTextLayer()]), timing: { duration: 2000 } };
    const { html } = await exportArtboardHtmlLayout(ab, 'en', {
      project: projectWith(ab),
      mode: 'snippet',
    });
    expect(html).not.toContain('<!doctype html>');
    expect(html).not.toContain('<body');
    expect(html).toContain('<style>');
    expect(html).toContain('class="calqo-artboard"');
    expect(html).toContain('@keyframes calqo-a');
  });

  it('warns once per child animation lost to a rasterized group', async () => {
    const freehandChild: CalqoLayer = {
      ...baseLayer,
      id: 'doodle',
      name: 'Doodle',
      type: 'shape',
      shape: 'freehand',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      fill: { type: 'solid', color: 'transparent' },
      animation: { mode: 'preset', enter: { kind: 'fade', duration: 300, delay: 0 } },
    } as CalqoLayer;
    const group: CalqoLayer = {
      ...baseLayer,
      id: 'g',
      name: 'Group',
      type: 'group',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      children: [freehandChild],
    } as CalqoLayer;
    const ab = { ...artboard([group]), timing: { duration: 2000 } };
    const rasterizeLayer = vi.fn().mockResolvedValue('data:image/png;base64,RASTER');
    const { warnings } = await exportArtboardHtmlLayout(ab, 'en', {
      project: projectWith(ab),
      rasterizeLayer,
    });
    const downgrades = warnings.filter((w) => w.code === 'animationDowngrade');
    expect(downgrades).toHaveLength(1);
    expect(downgrades[0].layerName).toBe('Doodle');
  });
});

describe('rasterReasonForLayer', () => {
  it('classifies the rasterized tier per the plan', () => {
    const freehand = {
      ...baseLayer,
      id: 'f',
      name: 'Doodle',
      type: 'shape',
      shape: 'freehand',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      fill: { type: 'solid', color: 'transparent' },
    } as CalqoLayer;
    expect(rasterReasonForLayer(freehand)).toBe('freehand');

    const group = {
      ...baseLayer,
      id: 'g',
      name: 'Group',
      type: 'group',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      children: [freehand],
    } as CalqoLayer;
    expect(rasterReasonForLayer(group)).toBe('group');

    expect(rasterReasonForLayer(textLayer())).toBeNull();
  });

  it('classifies background removal and exposes predictable preflight warnings', () => {
    const image = {
      ...baseLayer,
      id: 'removed', name: 'Cutout', type: 'image', x: 0, y: 0, w: 20, h: 20,
      assetId: 'asset-1', fit: 'cover',
      backgroundRemoval: {
        source: { assetId: 'source' }, result: { assetId: 'asset-1' }, passes: [],
      },
    } as CalqoLayer;
    expect(rasterReasonForLayer(image)).toBe('backgroundRemoval');
    expect(analyzeHtmlFidelity([artboard([image])])).toContainEqual({
      tier: 'rasterized', code: 'rasterized', layerName: 'Cutout', reason: 'backgroundRemoval',
    });
  });
});

describe('styleConversions', () => {
  it('converts fills and text styles to CSS', () => {
    expect(fillToCss({ type: 'solid', color: '#123456' })).toBe('#123456');
    expect(
      fillToCss({
        type: 'radial',
        stops: [
          { offset: 0, color: '#000' },
          { offset: 1, color: '#fff' },
        ],
      }),
    ).toBe('radial-gradient(circle, #000 0%, #fff 100%)');
    expect(
      fillToCss({
        type: 'pattern',
        pattern: 'dots',
        color: '#000',
        background: '#fff',
        scale: 1,
        angle: 0,
      }),
    ).toBeNull();
    const css = textStyleToCss({
      fontFamily: 'Inter',
      fontSize: 40,
      fontWeight: 700,
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#111827',
      align: 'left',
      lineHeight: 1.2,
      letterSpacing: 0.5,
    });
    expect(css).toContain("font-family:'Inter'");
    expect(css).toContain('font-style:italic');
    expect(css).toContain('text-decoration:underline');
    expect(css).toContain('letter-spacing:0.5px');
  });
});

describe('portable export fonts', () => {
  it('inlines used web-font bytes and omits unrelated font faces', async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter&family=Playfair+Display';
    document.head.append(link);
    const fontUrl = 'https://fonts.gstatic.com/s/playfair/test.woff2';
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('fonts.googleapis.com')) {
        return {
          ok: true,
          text: async () =>
            `@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/test.woff2) format('woff2'); }\n` +
            `@font-face { font-family: 'Playfair Display'; src: url(${fontUrl}) format('woff2'); }`,
        } as Response;
      }
      return {
        ok: value === fontUrl,
        blob: async () => new Blob(['portable-font'], { type: 'font/woff2' }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const layer = textLayer();
    if (layer.type === 'text') layer.style.fontFamily = 'Playfair Display';

    const css = await embeddedFontCss(artboard([layer]));

    expect(css).toContain("font-family: 'Playfair Display'");
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toContain(fontUrl);
    expect(css).not.toContain("font-family: 'Inter'");
    link.remove();
    vi.unstubAllGlobals();
  });
});
