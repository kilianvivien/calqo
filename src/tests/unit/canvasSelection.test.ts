import { describe, expect, it } from 'vitest';
import { layerListensForCanvasEvents } from '@/editor/canvas/canvasHitTesting';
import { createShapeLayer } from '@/editor/commands/projectCommands';

describe('canvas layer hit testing', () => {
  it('lets clicks pass through a locked full-artboard background layer', () => {
    const background = createShapeLayer('rect', 0, 0, 1080, 1080);
    background.name = 'Background';
    background.locked = true;

    expect(layerListensForCanvasEvents(background)).toBe(false);
  });

  it('keeps unlocked layers interactive', () => {
    const textPanel = createShapeLayer('rect', 96, 96, 480, 240);

    expect(layerListensForCanvasEvents(textPanel)).toBe(true);
  });
});
