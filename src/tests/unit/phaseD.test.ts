import { describe, expect, it } from 'vitest';
import { rasterFilename } from '@/editor/export/rasterExport';
import { htmlSnippet, htmlStandalone } from '@/editor/export/htmlExport';
import { exportArtboardSvg } from '@/editor/export/svgExport';
import { createShapeLayer, createTextLayer } from '@/editor/commands/projectCommands';
import { createArtboard, createDefaultProject } from '@/lib/schema';

describe('phase D — export helpers', () => {
  it('builds slugged raster filenames with scale + extension', () => {
    expect(rasterFilename('My Project!', 'Instagram Square', 'png', 1)).toBe(
      'my-project-instagram-square.png',
    );
    expect(rasterFilename('My Project', 'Story', 'png', 2)).toBe('my-project-story@2x.png');
    expect(rasterFilename('P', 'A', 'jpeg', 3)).toBe('p-a@3x.jpg');
  });

  it('wraps a PNG data URL into a sized HTML snippet and standalone doc', () => {
    const input = {
      title: 'Calqo <demo>',
      width: 1080,
      height: 1080,
      pngDataUrl: 'data:image/png;base64,AAAA',
    };
    const snippet = htmlSnippet(input);
    expect(snippet).toContain('width:1080px;height:1080px');
    expect(snippet).toContain('data:image/png;base64,AAAA');
    expect(snippet).toContain('Calqo &lt;demo&gt;'); // escaped alt

    const doc = htmlStandalone(input);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<title>Calqo &lt;demo&gt;</title>');
    expect(doc).toContain('calqo-embed');
  });

  it('serializes shapes and text to SVG without warnings', async () => {
    const project = createDefaultProject();
    const artboard = createArtboard('ig-square');
    artboard.background = { type: 'solid', color: '#101010' };
    artboard.layers.push(createShapeLayer('rect', 10, 10, 100, 60));
    artboard.layers.push(createTextLayer(project, 20, 200));

    const { svg, warnings } = await exportArtboardSvg(
      artboard,
      project.activeContentLocale,
    );

    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#101010"'); // background
    expect(svg).toContain('<rect');
    expect(svg).toContain('<text');
    expect(warnings).toEqual([]);
  });

  it('lets the SVG viewer anchor centred text with its actual font metrics', async () => {
    const project = createDefaultProject();
    const artboard = createArtboard('ig-square');
    const text = createTextLayer(project, 20, 200);
    text.w = 600;
    text.style.align = 'center';
    artboard.layers.push(text);

    const { svg } = await exportArtboardSvg(artboard, 'en');

    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toMatch(/<tspan x="300" y="[^"]+">/);
  });

  it('exports freehand and arrow shapes as curves/heads, not rectangles', async () => {
    const artboard = createArtboard('ig-square');

    const freehand = createShapeLayer('freehand', 0, 0, 100, 100);
    if (freehand.type === 'shape') {
      freehand.points = [0, 0, 40, 60, 90, 20, 100, 100];
      freehand.tension = 0.4;
    }
    artboard.layers.push(freehand);

    const arrow = createShapeLayer('arrow', 0, 0, 120, 0);
    if (arrow.type === 'shape') arrow.points = [0, 0, 120, 0];
    artboard.layers.push(arrow);

    const { svg } = await exportArtboardSvg(artboard, 'en');

    // Freehand renders as a smoothed path (cubic segments), never a <rect>.
    expect(svg).toMatch(/<path d="M [^"]*C /);
    // Arrow renders a shaft path plus a triangular head polygon.
    expect(svg).toContain('<polygon');
  });

  it('exports alternate arrow head styles to SVG', async () => {
    const artboard = createArtboard('ig-square');
    const arrow = createShapeLayer('arrow', 0, 0, 120, 0);
    if (arrow.type === 'shape') {
      arrow.points = [0, 0, 120, 0];
      arrow.arrow = { start: false, end: true, pointerLength: 16, pointerWidth: 16, headStyle: 'dot' };
    }
    artboard.layers.push(arrow);

    const { svg } = await exportArtboardSvg(artboard, 'en');

    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<polygon');
  });

  it('exports selected line cap and join styles to SVG', async () => {
    const artboard = createArtboard('ig-square');
    const line = createShapeLayer('line', 0, 0, 120, 0);
    if (line.type === 'shape') {
      line.points = [0, 0, 60, 40, 120, 0];
      line.stroke = { color: '#111111', width: 8, cap: 'square', join: 'bevel' };
    }
    artboard.layers.push(line);

    const { svg } = await exportArtboardSvg(artboard, 'en');

    expect(svg).toContain('stroke-linecap="square"');
    expect(svg).toContain('stroke-linejoin="bevel"');
  });
});
