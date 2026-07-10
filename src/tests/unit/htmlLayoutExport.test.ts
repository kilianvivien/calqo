import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalqoArtboard, CalqoLayer } from '@/lib/schema';

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
  exportArtboardHtmlLayout,
  rasterReasonForLayer,
} from '@/editor/export/htmlLayoutExport';
import { fillToCss, textStyleToCss } from '@/editor/export/styleConversions';
import { HTML_RASTER_REASONS } from '@/editor/export/exportWarnings';

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
    expect(html).toContain('data-rasterized="unsupported mask shape"');
    expect(html).toContain('data:image/png;base64,RASTER');
    expect(
      warnings.some((warning) => warning.includes('Star photo')),
    ).toBe(true);
  });

  it('always names the font caveat and never loses fidelity silently', async () => {
    const { warnings } = await exportArtboardHtmlLayout(artboard([textLayer()]), 'en');
    expect(warnings.some((warning) => warning.includes('family name'))).toBe(true);
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
    expect(rasterReasonForLayer(freehand)).toBe(HTML_RASTER_REASONS.freehand);

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
    expect(rasterReasonForLayer(group)).toBe(HTML_RASTER_REASONS.group);

    expect(rasterReasonForLayer(textLayer())).toBeNull();
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
    expect(css).toContain('font-family:"Inter"');
    expect(css).toContain('font-style:italic');
    expect(css).toContain('text-decoration:underline');
    expect(css).toContain('letter-spacing:0.5px');
  });
});
