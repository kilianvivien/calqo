import '@testing-library/jest-dom/vitest';
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
