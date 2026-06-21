import { describe, expect, it } from 'vitest';
import {
  backgroundFillForType,
  fillForType,
  fillBaseColor,
} from '@/editor/canvas/fillHelpers';
import { fitImageConfig } from '@/editor/canvas/imageFilters';
import { imageFillProps } from '@/editor/canvas/shapeStyle';
import type { Fill } from '@/lib/schema';

const fakeImage = (w: number, h: number) =>
  ({ width: w, height: h }) as unknown as HTMLImageElement;

describe('fill helpers', () => {
  it('seeds gradients and patterns from the current base colour', () => {
    const solid: Fill = { type: 'solid', color: '#112233' };
    const linear = fillForType('linear', solid);
    expect(linear.type).toBe('linear');
    if (linear.type === 'linear') {
      expect(linear.stops).toHaveLength(2);
      expect(linear.stops[0].color).toBe('#112233');
    }
    const pattern = fillForType('pattern', solid);
    expect(pattern).toMatchObject({ type: 'pattern', pattern: 'dots', color: '#112233' });
  });

  it('builds an image fill only when an asset id is supplied', () => {
    const solid: Fill = { type: 'solid', color: '#fff' };
    expect(fillForType('image', solid)).toBe(solid);
    expect(fillForType('image', solid, 'asset-1')).toEqual({
      type: 'image',
      assetId: 'asset-1',
      fit: 'cover',
    });
  });

  it('builds image backgrounds and reads base colours', () => {
    expect(backgroundFillForType('image', { type: 'solid', color: '#000' }, 'a')).toEqual({
      type: 'image',
      assetId: 'a',
      fit: 'cover',
    });
    expect(fillBaseColor({ type: 'radial', stops: [{ offset: 0, color: '#abcdef' }, { offset: 1, color: '#000' }] })).toBe(
      '#abcdef',
    );
  });
});

describe('image fit/fill geometry', () => {
  it('covers a box by cropping the longer axis', () => {
    const cfg = fitImageConfig(fakeImage(200, 100), 'cover', 100, 100);
    expect(cfg.width).toBe(100);
    expect(cfg.height).toBe(100);
    expect(cfg.crop).toBeDefined();
  });

  it('contains a box with letterboxing offset', () => {
    const cfg = fitImageConfig(fakeImage(200, 100), 'contain', 100, 100);
    // scale = min(100/200, 100/100) = 0.5 → 100x50 centred vertically
    expect(cfg.width).toBe(100);
    expect(cfg.height).toBe(50);
    expect(cfg.y).toBe(25);
  });

  it('centres a cover pattern fill larger than the box', () => {
    const props = imageFillProps(fakeImage(100, 100), 'cover', 200, 100);
    expect(props.fillPatternScaleX).toBe(2);
    expect(props.fillPatternScaleY).toBe(2);
    expect(props.fillPatternX).toBe(0);
    expect(props.fillPatternY).toBe(-50);
  });

  it('offsets a centre-origin (ellipse) image fill around the local origin', () => {
    const props = imageFillProps(fakeImage(100, 100), 'cover', 100, 100, true);
    expect(props.fillPatternX).toBe(-50);
    expect(props.fillPatternY).toBe(-50);
  });
});
