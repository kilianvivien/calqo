import { describe, it, expect } from 'vitest';
import { buildCanvasFontString } from '@/editor/canvas/konvaTextFont';

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
