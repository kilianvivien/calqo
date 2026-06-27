import { describe, expect, it } from 'vitest';
import { createDefaultProject, safeImportProject } from '@/lib/schema';
import type { CalqoProject, ImageLayer, ShapeLayer, StrokeLook } from '@/lib/schema';
import { applyLayerPatch } from '@/editor/utils/layers';
import {
  BRUSH_STYLE_IDS,
  brushStyleLayerPatch,
  createFreehandLayer,
} from '@/editor/commands/projectCommands';
import { FRAME_PRESET_IDS, framePreset } from '@/editor/images/framePresets';
import { STROKE_LOOK_IDS, strokeLookStyle } from '@/editor/canvas/strokePresets';
import { strokeLookConfig, strokeLookNeedsRasterWarning } from '@/editor/canvas/strokeStyle';
import { frameRender } from '@/editor/canvas/frameNodes';
import { checkTemplateQuality } from '@/editor/ai/validation';
import { buildTemplateInput } from '@/editor/ai/promptTemplateService';

function imageLayer(): ImageLayer {
  return {
    id: 'img1',
    name: 'Photo',
    type: 'image',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    assetId: 'asset-1',
    fit: 'cover',
    crop: { x: 10, y: 20, w: 100, h: 80 },
    focalPoint: { x: 0.3, y: 0.7 },
    mask: { shape: 'circle' },
    filters: { brightness: 0.2 },
  };
}

describe('phase R — schema round-trip', () => {
  it('imports a v1 document carrying frame / sticker / expanded stroke', () => {
    const project = createDefaultProject();
    const layer: ShapeLayer = {
      id: 'shape1',
      name: 'Box',
      type: 'shape',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      shape: 'rect',
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { color: '#000000', width: 4, look: 'neon', altColor: '#00ffff', intensity: 0.8, join: 'round' },
      sticker: { color: '#ffffff', width: 12 },
    };
    const img = imageLayer();
    img.frame = framePreset('polaroid');
    project.artboards[0].layers.push(layer, img);

    const result = safeImportProject(project);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const shape = result.project.artboards[0].layers[0] as ShapeLayer;
      expect(shape.stroke?.look).toBe('neon');
      expect(shape.sticker?.width).toBe(12);
      const image = result.project.artboards[0].layers[1] as ImageLayer;
      expect(image.frame?.kind).toBe('polaroid');
    }
  });

  it('still imports an old v1 document with none of the new fields', () => {
    const project = createDefaultProject();
    const result = safeImportProject(project);
    expect(result.ok).toBe(true);
  });

  it('imports a document carrying a creative frame and a roughened look', () => {
    const project = createDefaultProject();
    const layer: ShapeLayer = {
      id: 'shape2',
      name: 'Sketchy',
      type: 'shape',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      shape: 'rect',
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { color: '#000000', width: 4, look: 'sketch' },
    };
    const img = imageLayer();
    img.frame = framePreset('scalloped-edges');
    project.artboards[0].layers.push(layer, img);

    const result = safeImportProject(project);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const shape = result.project.artboards[0].layers[0] as ShapeLayer;
      expect(shape.stroke?.look).toBe('sketch');
      const image = result.project.artboards[0].layers[1] as ImageLayer;
      expect(image.frame?.kind).toBe('scalloped-edges');
    }
  });
});

describe('phase R — frame presets', () => {
  it('exposes a preset for every frame id', () => {
    for (const id of FRAME_PRESET_IDS) {
      expect(framePreset(id).kind).toBe(id);
    }
  });

  it('applying / removing a frame preserves crop, focal, mask, and filters', () => {
    const layer = imageLayer();
    applyLayerPatch(layer, { frame: framePreset('rounded') });
    expect(layer.frame?.kind).toBe('rounded');
    expect(layer.crop).toEqual({ x: 10, y: 20, w: 100, h: 80 });
    expect(layer.focalPoint).toEqual({ x: 0.3, y: 0.7 });
    expect(layer.mask).toEqual({ shape: 'circle' });
    expect(layer.filters).toEqual({ brightness: 0.2 });

    applyLayerPatch(layer, { frame: null });
    expect(layer.frame).toBeUndefined();
    expect(layer.crop).toEqual({ x: 10, y: 20, w: 100, h: 80 });
    expect(layer.mask).toEqual({ shape: 'circle' });
  });

  it('insets the image content and keeps the box for a bordered frame', () => {
    const render = frameRender(framePreset('inset'), 400, 300);
    expect(render.inset.top).toBeGreaterThan(0);
    expect(render.front.length).toBeGreaterThan(0);
  });

  it('reserves a bottom caption strip for polaroid', () => {
    const render = frameRender(framePreset('polaroid'), 400, 300, 'Hello');
    expect(render.inset.bottom).toBeGreaterThan(render.inset.top);
    expect(render.front.some((spec) => spec.kind === 'caption')).toBe(true);
  });

  it('renders creative outline frames as a path with a positive inset', () => {
    for (const id of ['scalloped-edges', 'torn-paper'] as const) {
      const render = frameRender(framePreset(id), 400, 300);
      expect(render.inset.top).toBeGreaterThan(0);
      expect(render.behind.some((spec) => spec.kind === 'path')).toBe(true);
    }
  });

  it('pins tape corners as rotated front rects', () => {
    const render = frameRender(framePreset('tape-corners'), 400, 300);
    const tape = render.front.filter((spec) => spec.kind === 'rect' && spec.rotation);
    expect(tape.length).toBe(4);
  });

  it('draws a dashed perforation ring for postage-stamp', () => {
    const render = frameRender(framePreset('postage-stamp'), 400, 300);
    expect(render.front.some((spec) => spec.kind === 'rect' && spec.dash)).toBe(true);
  });
});

describe('phase R — stroke looks', () => {
  it('seeds every look id with its name', () => {
    for (const id of STROKE_LOOK_IDS) {
      const next = strokeLookStyle(id, { color: '#111111', width: 4 });
      // 'plain' intentionally clears the look field to keep the schema lean.
      if (id === 'plain') expect(next.look).toBeUndefined();
      else expect(next.look).toBe(id);
    }
  });

  it('renders neon / glow as a stroke shadow', () => {
    const neon = strokeLookConfig({ color: '#ff0000', width: 6, look: 'neon', intensity: 0.8 });
    expect(neon.shadowForStrokeEnabled).toBe(true);
    expect(neon.shadowBlur).toBeGreaterThan(0);
  });

  it('renders dotted as a round-capped dash', () => {
    const dotted = strokeLookConfig({ color: '#000000', width: 4, style: 'dotted' });
    expect(Array.isArray(dotted.dash)).toBe(true);
    expect(dotted.lineCap).toBe('round');
  });

  it('renders a roughened look (sketch) distinctly and flags it for raster', () => {
    const sketch = strokeLookConfig({ color: '#000000', width: 4, look: 'sketch' });
    expect(Array.isArray(sketch.dash)).toBe(true);
    expect(sketch.shadowForStrokeEnabled).toBe(true);
    expect(strokeLookNeedsRasterWarning({ color: '#000000', width: 4, look: 'sketch' })).toBe(true);
  });
});

describe('phase R — brush presets', () => {
  it('exposes the full desktop/mobile brush preset set', () => {
    expect(BRUSH_STYLE_IDS).toEqual([
      'smooth',
      'marker',
      'felt-tip',
      'highlighter',
      'marker-underline',
      'glow-pen',
      'chalk',
      'crayon',
      'dashed',
    ]);
  });

  it('maps chalk / crayon to expected feel', () => {
    const chalk = brushStyleLayerPatch('chalk', { color: '#334155', width: 10 });
    expect(chalk.blendMode).toBe('multiply');
    expect(chalk.opacity).toBeLessThan(1);
    expect(chalk.stroke.look).toBeUndefined();

    const crayon = brushStyleLayerPatch('crayon', { color: '#334155', width: 10 });
    expect(crayon.stroke.look).toBe('sketch');
    expect(crayon.stroke.cap).toBe('round');
  });

  it('creates new freehand strokes with Phase R brush styles', () => {
    const glow = createFreehandLayer([0, 0, 40, 20], {
      fill: '#ffffff',
      stroke: '#007aff',
      strokeWidth: 2,
      brushSize: 12,
      brushStyle: 'glow-pen',
    });
    expect(glow?.type).toBe('shape');
    if (glow?.type === 'shape') {
      expect(glow.shape).toBe('freehand');
      expect(glow.stroke?.look).toBe('glow');
      expect(glow.stroke?.width).toBe(12);
    }
  });

  it('restyles existing freehand strokes and clears blend mode when needed', () => {
    const underline = brushStyleLayerPatch('marker-underline', {
      color: '#111111',
      width: 9,
    });
    expect(underline.blendMode).toBe('multiply');
    expect(underline.stroke.cap).toBe('square');

    const smooth = brushStyleLayerPatch('smooth', underline.stroke);
    expect(smooth.blendMode).toBe('normal');
    expect(smooth.stroke.color).toBe('#111111');
    expect(smooth.stroke.width).toBe(9);
    expect(smooth.stroke.look).toBeUndefined();
  });
});

describe('phase R — AI preset validation', () => {
  const input = buildTemplateInput({ prompt: 'x', preset: 'ig-square', locale: 'en' });

  function projectWithLook(look: string): CalqoProject {
    const project = createDefaultProject();
    const layer: ShapeLayer = {
      id: 's',
      name: 'Box',
      type: 'shape',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      shape: 'rect',
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { color: '#000000', width: 4, look: look as StrokeLook },
    };
    project.artboards[0].layers.push(layer);
    return project;
  }

  it('accepts a supported stroke look without warnings about it', () => {
    const project = projectWithLook('neon');
    const { warnings } = checkTemplateQuality(project, input);
    expect(warnings.some((w) => w.includes('stroke look'))).toBe(false);
  });

  it('warns (not fails) when an unsupported look is requested', () => {
    const project = projectWithLook('neon');
    const restricted = { ...input, strokeLooks: ['plain', 'dashed'] };
    const { issues, warnings } = checkTemplateQuality(project, restricted);
    expect(issues.some((i) => i.includes('stroke look'))).toBe(false);
    expect(warnings.some((w) => w.includes('stroke look'))).toBe(true);
  });
});
