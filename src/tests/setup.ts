import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import '@/lib/i18n';
import React from 'react';
import { vi } from 'vitest';

function mockKonvaComponent(name: string) {
  return React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
    ({ children, ...props }, ref) =>
      React.createElement('div', { ...props, ref, 'data-konva': name }, children),
  );
}

vi.mock('react-konva', () => ({
  Stage: mockKonvaComponent('Stage'),
  Layer: mockKonvaComponent('Layer'),
  Rect: mockKonvaComponent('Rect'),
  Text: mockKonvaComponent('Text'),
  Group: mockKonvaComponent('Group'),
  Image: mockKonvaComponent('Image'),
  Line: mockKonvaComponent('Line'),
  Ellipse: mockKonvaComponent('Ellipse'),
  Transformer: mockKonvaComponent('Transformer'),
}));

// jsdom has no real 2D canvas. Raw Konva (used by the offscreen scene and raster
// export, not the mocked react-konva) drives a wide surface of context methods
// while rendering, so back the mock with a Proxy: known value-properties are
// stored, gradient/pattern creators return an `addColorStop`-capable stub, and
// every other method is a no-op. This lets `layer.draw()` run without throwing.
function makeContext2D(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {
    canvas,
    font: '10px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
  };
  const gradientStub = { addColorStop: () => {} };
  const explicit: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text: unknown) => ({ width: String(text).length * 8 }),
    getImageData: (_x, _y, w, h) => ({
      data: new Uint8ClampedArray(Math.max(1, Number(w) || 1) * Math.max(1, Number(h) || 1) * 4),
      width: Number(w) || 1,
      height: Number(h) || 1,
    }),
    createImageData: (w, h) => ({
      data: new Uint8ClampedArray(Math.max(1, Number(w) || 1) * Math.max(1, Number(h) || 1) * 4),
    }),
    createLinearGradient: () => gradientStub,
    createRadialGradient: () => gradientStub,
    createPattern: () => ({}),
  };
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in explicit) return explicit[prop];
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(function (this: HTMLCanvasElement) {
    return makeContext2D(this);
  }),
});

Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  configurable: true,
  value: vi.fn(() => 'data:image/png;base64,'),
});
