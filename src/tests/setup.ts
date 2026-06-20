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

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(() => ({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) })),
    fillText: vi.fn(),
    font: '',
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    putImageData: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    strokeText: vi.fn(),
  })),
});

Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  configurable: true,
  value: vi.fn(() => 'data:image/png;base64,'),
});
