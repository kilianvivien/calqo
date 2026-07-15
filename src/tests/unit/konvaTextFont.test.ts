import { describe, it, expect } from 'vitest';
import { buildCanvasFontString } from '@/editor/canvas/konvaTextFont';
import {
  collectCanvasFontFaces,
  loadCanvasFontFaces,
} from '@/editor/canvas/canvasFonts';
import { createArtboard } from '@/lib/schema/defaults';
import type { CalqoLayer, TextLayer } from '@/lib/schema';

function fakeNode({
  style = 'normal',
  size = 48,
  family = 'Inter',
  weight,
}: {
  style?: string;
  size?: number;
  family?: string;
  weight?: number | string;
}) {
  return {
    fontStyle: () => style,
    fontSize: () => size,
    fontFamily: () => family,
    getAttr: (key: string) => (key === 'fontWeight' ? weight : undefined),
  };
}

describe('buildCanvasFontString', () => {
  it('emits the standard CSS font shorthand', () => {
    const font = buildCanvasFontString(
      fakeNode({ style: 'normal', size: 48, family: 'Marianne', weight: 700 }),
    );
    expect(font).toBe('normal 700 48px Marianne');
  });

  it('emits different strings for 700 vs 800', () => {
    const a = buildCanvasFontString(
      fakeNode({ style: 'normal', size: 48, family: 'Marianne', weight: 700 }),
    );
    const b = buildCanvasFontString(
      fakeNode({ style: 'normal', size: 48, family: 'Marianne', weight: 800 }),
    );
    expect(a).not.toBe(b);
    expect(a).toBe('normal 700 48px Marianne');
    expect(b).toBe('normal 800 48px Marianne');
  });

  it('falls back to weight 400 when the attribute is missing', () => {
    const font = buildCanvasFontString(
      fakeNode({ style: 'normal', size: 48, family: 'Inter' }),
    );
    expect(font).toBe('normal 400 48px Inter');
  });

  it('preserves italic in the style slot', () => {
    const font = buildCanvasFontString(
      fakeNode({ style: 'italic', size: 24, family: 'Marianne', weight: 700 }),
    );
    expect(font).toBe('italic 700 24px Marianne');
  });
});

function textLayer(
  id: string,
  family: string,
  weight: number,
  style: 'normal' | 'italic' = 'normal',
): TextLayer {
  return {
    id,
    name: id,
    type: 'text',
    x: 0,
    y: 0,
    w: 200,
    h: 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    text: { en: 'Font sample' },
    style: {
      fontFamily: family,
      fontSize: 32,
      fontWeight: weight,
      fontStyle: style,
      textDecoration: 'none',
      color: '#000000',
      align: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
    },
  };
}

describe('canvas font loading', () => {
  it('collects and deduplicates exact faces from nested artboard layers', () => {
    const artboard = createArtboard();
    artboard.layers = [
      textLayer('body', 'Space Grotesk', 600),
      textLayer('body-copy', 'Space Grotesk', 600),
      {
        id: 'group',
        name: 'Group',
        type: 'group',
        x: 0,
        y: 0,
        w: 200,
        h: 80,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        children: [textLayer('heading', 'Fraunces', 700, 'italic')],
      },
    ] satisfies CalqoLayer[];

    expect(collectCanvasFontFaces(artboard)).toEqual([
      { family: 'Fraunces', weight: 700, style: 'italic' },
      { family: 'Space Grotesk', weight: 600, style: 'normal' },
    ]);
  });

  it('requests every face with the CSS shorthand Konva will use', async () => {
    const requested: string[] = [];
    await loadCanvasFontFaces(
      [
        { family: 'Fraunces', weight: 700, style: 'italic' },
        { family: 'Space Grotesk', weight: 600, style: 'normal' },
      ],
      {
        load: async (font) => {
          requested.push(font);
        },
      },
    );

    expect(requested).toEqual([
      'italic 700 16px "Fraunces"',
      'normal 600 16px "Space Grotesk"',
    ]);
  });
});
