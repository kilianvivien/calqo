import { describe, expect, it } from 'vitest';
import type { Group } from 'konva/lib/Group';
import type { Shape } from 'konva/lib/Shape';
import { buildNode } from '@/editor/export/rasterExport';
import { blurCachePadding } from '@/editor/canvas/layerBlur';
import type {
  CalqoLayer,
  ImageLayer,
  ListLayer,
  TextLayer,
} from '@/lib/schema';

/**
 * Raster export rebuilds the scene with its own node builder rather than
 * reusing the live Konva tree, so every effect the canvas renders has to be
 * mirrored here by hand. These tests pin the effects that were silently absent:
 * a PNG that drops them is indistinguishable from a correct one until someone
 * compares it to the canvas.
 */

const STYLE: TextLayer['style'] = {
  fontFamily: 'Inter',
  fontSize: 32,
  fontWeight: 700,
  fontStyle: 'normal',
  textDecoration: 'none',
  color: '#111827',
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
};

const BOX = {
  x: 10,
  y: 20,
  w: 200,
  h: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
} as const;

const textLayer = (extra: Partial<TextLayer> = {}): CalqoLayer =>
  ({
    id: 't1',
    name: 'Text',
    type: 'text',
    ...BOX,
    text: { en: 'Fidelity' },
    style: STYLE,
    ...extra,
  }) as CalqoLayer;

const listLayer = (extra: Partial<ListLayer> = {}): CalqoLayer =>
  ({
    id: 'l1',
    name: 'List',
    type: 'list',
    ...BOX,
    items: [{ id: 'i1', text: { en: 'Row' } }],
    marker: { kind: 'bullet', color: '#111827' },
    markerGap: 8,
    style: STYLE,
    ...extra,
  }) as CalqoLayer;

const imageLayer = (extra: Partial<ImageLayer> = {}): CalqoLayer =>
  ({
    id: 'im1',
    name: 'Image',
    type: 'image',
    ...BOX,
    assetId: 'asset-1',
    fit: 'cover',
    ...extra,
  }) as CalqoLayer;

const shapeLayer = (extra: Record<string, unknown> = {}): CalqoLayer =>
  ({
    id: 's1',
    name: 'Shape',
    type: 'shape',
    shape: 'rect',
    ...BOX,
    fill: { type: 'solid', color: '#3366ff' },
    ...extra,
  }) as CalqoLayer;

const groupLayer = (extra: Record<string, unknown> = {}): CalqoLayer =>
  ({
    id: 'g1',
    name: 'Group',
    type: 'group',
    ...BOX,
    children: [],
    ...extra,
  }) as CalqoLayer;

/** A 1×1 stand-in for a loaded asset — enough for node construction. */
function images(): Map<string, HTMLImageElement> {
  const image = new Image();
  Object.defineProperty(image, 'width', { value: 4 });
  Object.defineProperty(image, 'height', { value: 4 });
  return new Map([['asset-1', image]]);
}

const build = (layer: CalqoLayer) => buildNode(layer, images(), 'en');
const filterNames = (node: Group | Shape | null) =>
  ((node as Shape)?.filters() ?? []).map((f) => f.name);

describe('raster export mirrors the canvas renderer', () => {
  it('applies layer blur to text', () => {
    expect(filterNames(build(textLayer()))).toEqual([]);

    const blurred = build(textLayer({ effects: { blur: 9 } }));

    expect(filterNames(blurred)).toEqual(['Blur']);
    expect(blurred?.getAttr('blurRadius')).toBe(9);
  });

  it('applies layer blur to shapes, lists and groups', () => {
    const shape = build(shapeLayer({ effects: { blur: 12 } }));
    expect(filterNames(shape)).toEqual(['Blur']);
    expect(shape?.getAttr('blurRadius')).toBe(12);

    const list = build(listLayer({ effects: { blur: 5 } }));
    expect(filterNames(list)).toEqual(['Blur']);
    expect(list?.getAttr('blurRadius')).toBe(5);

    const group = build(groupLayer({ effects: { blur: 4 } }));
    expect(filterNames(group)).toEqual(['Blur']);
  });

  it('pads the cache of every blurred node so the blur can fall off', () => {
    // A cache sized to the node clips the blur away entirely for a shape whose
    // fill covers its own box — it blurs to the same solid box.
    expect(blurCachePadding(12)).toBeGreaterThan(12);
    expect(blurCachePadding(0)).toBe(0);

    const shape = build(shapeLayer({ effects: { blur: 12 } }));
    expect(shape?.getAttr('calqoBlurPad')).toBe(blurCachePadding(12));
    expect(build(shapeLayer())?.getAttr('calqoBlurPad')).toBeUndefined();
  });

  it('leaves image layers to their own filter pipeline', () => {
    // The live canvas skips images in useLayerBlur; blur arrives through
    // `filters.blur` instead, so the export must not double up.
    const node = build(imageLayer({ effects: { blur: 8 } }));
    expect(filterNames(node)).toEqual([]);
  });

  it('applies image adjustment filters', () => {
    expect(filterNames(build(imageLayer()))).toEqual([]);

    const adjusted = build(
      imageLayer({
        filters: { brightness: 0.5, contrast: 20, saturation: -0.4, blur: 6 },
      }),
    );

    expect(filterNames(adjusted)).toEqual([
      'Brighten',
      'Contrast',
      'HSL',
      'Blur',
    ]);
    expect(adjusted?.getAttr('brightness')).toBe(0.5);
    expect(adjusted?.getAttr('contrast')).toBe(20);
    expect(adjusted?.getAttr('saturation')).toBe(-0.4);
    expect(adjusted?.getAttr('blurRadius')).toBe(6);
  });

  it('carries the blend mode on group layers', () => {
    // Konva's own default; `normal` stays implicit rather than being written.
    expect(build(groupLayer())?.getAttr('globalCompositeOperation')).toBe(
      'source-over',
    );
    expect(
      build(groupLayer({ blendMode: 'multiply' }))?.getAttr(
        'globalCompositeOperation',
      ),
    ).toBe('multiply');
  });

  it('carries blend mode and shadow on list layers', () => {
    const node = build(
      listLayer({
        blendMode: 'screen',
        effects: {
          shadow: {
            color: '#ff0000',
            blur: 8,
            offsetX: 4,
            offsetY: 5,
            opacity: 0.5,
          },
        },
      }),
    );

    expect(node?.getAttr('globalCompositeOperation')).toBe('screen');
    expect(node?.getAttr('shadowColor')).toBe('#ff0000');
    expect(node?.getAttr('shadowBlur')).toBe(8);
    expect(node?.getAttr('shadowOffsetX')).toBe(4);
    expect(node?.getAttr('shadowOffsetY')).toBe(5);
    expect(node?.getAttr('shadowOpacity')).toBe(0.5);
  });

  it('keeps list markers on one line', () => {
    const node = build(listLayer()) as Group;
    const marker = node.getChildren()[0] as Shape;
    expect(marker.getAttr('wrap')).toBe('none');
  });
});
