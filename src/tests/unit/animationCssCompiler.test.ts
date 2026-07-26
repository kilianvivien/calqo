import { describe, expect, it } from 'vitest';
import { compileClip } from '@/editor/animation/compiler';
import { compileAnimationCss } from '@/editor/export/animationCssCompiler';
import type { LayerBox } from '@/editor/animation/wrapperNode';
import type { CalqoArtboard } from '@/lib/schema';
import { v2StaticProject } from '../fixtures/animation/fixtures';

const BOX: LayerBox = { x: 100, y: 200, w: 300, h: 400 };

function boxesFor(artboard: CalqoArtboard): Map<string, LayerBox> {
  const map = new Map<string, LayerBox>();
  const walk = (layers: CalqoArtboard['layers']) => {
    for (const l of layers) {
      map.set(l.id, { x: l.x, y: l.y, w: l.w, h: l.h });
      if (l.type === 'group') walk(l.children);
    }
  };
  walk(artboard.layers);
  return map;
}

/** Build a single-shape animated artboard for a preset. */
function fadeArtboard(): CalqoArtboard {
  return {
    id: 'ab',
    name: 'Square',
    preset: 'ig-square',
    width: 1080,
    height: 1080,
    background: { type: 'solid', color: '#FFFFFF' },
    timing: { duration: 2000 },
    layers: [
      {
        id: 'sh',
        name: 'Shape',
        type: 'shape',
        shape: 'rect',
        x: 100,
        y: 200,
        w: 300,
        h: 400,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: { type: 'solid', color: '#000000' },
        animation: {
          mode: 'preset',
          enter: { kind: 'fade', duration: 500, delay: 0 },
        },
      } as CalqoArtboard['layers'][number],
    ],
  };
}

describe('animationCssCompiler', () => {
  it('produces no CSS for a static (unanimated) project', () => {
    const artboard = v2StaticProject.artboards[0];
    const { clip } = compileClip({
      projectId: v2StaticProject.id,
      artboard,
      locale: 'en',
      fps: 30,
    });
    const result = compileAnimationCss({
      clip,
      boxes: boxesFor(artboard),
      sceneDurationMs: 5000,
      scopeId: 'abc',
    });
    expect(result.css).toBe('');
    expect(result.bindings.size).toBe(0);
  });

  it('gates animation behind prefers-reduced-motion and scopes names', () => {
    const artboard = fadeArtboard();
    const { clip } = compileClip({
      projectId: 'p',
      artboard,
      locale: 'en',
      fps: 30,
    });
    const { css, bindings } = compileAnimationCss({
      clip,
      boxes: boxesFor(artboard),
      sceneDurationMs: 2000,
      scopeId: 'zz1',
    });
    const binding = bindings.get('sh');
    expect(binding).toBeDefined();
    // Scoped class carries the scope id and a sanitized layer id.
    expect(binding!.wrapperClass).toContain('calqo-azz1-');
    // Reduced-motion gate wraps the keyframes + animation, not the base origin.
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(css).toContain(`@keyframes ${binding!.wrapperClass}`);
    expect(css).toContain(`animation:${binding!.wrapperClass} 2000ms linear both`);
    // Base rule (transform-origin at the layer centre) is always on.
    expect(css).toContain(`transform-origin:${100 + 300 / 2}px ${200 + 400 / 2}px`);
    // Explicit start and end stops.
    expect(css).toMatch(/\n\s*0% \{/);
    expect(css).toMatch(/\n\s*100% \{/);
    // A fade enter ramps opacity from 0 up.
    expect(css).toContain('opacity:0;');
  });

  it('maps wipe to clip-path and blur to filter', () => {
    const artboard = fadeArtboard();
    // Swap the fade for a wipe enter + blur-in exit.
    (artboard.layers[0] as { animation: unknown }).animation = {
      mode: 'preset',
      enter: { kind: 'wipe', duration: 500, delay: 0, direction: 'left' },
      exit: { kind: 'blur-in', duration: 500, delay: 0 },
    };
    const { clip } = compileClip({
      projectId: 'p',
      artboard,
      locale: 'en',
      fps: 30,
    });
    const { css } = compileAnimationCss({
      clip,
      boxes: boxesFor(artboard),
      sceneDurationMs: 2000,
      scopeId: 'w',
    });
    expect(css).toContain('clip-path:polygon(');
    expect(css).toContain('filter:blur(');
  });

  it('is deterministic for identical input', () => {
    const artboard = fadeArtboard();
    const boxes = boxesFor(artboard);
    const compileOnce = () => {
      const { clip } = compileClip({ projectId: 'p', artboard, locale: 'en', fps: 30 });
      return compileAnimationCss({ clip, boxes, sceneDurationMs: 2000, scopeId: 's' }).css;
    };
    expect(compileOnce()).toBe(compileOnce());
  });

  it('ignores layers with no box mapping', () => {
    const artboard = fadeArtboard();
    const { clip } = compileClip({ projectId: 'p', artboard, locale: 'en', fps: 30 });
    const { css, bindings } = compileAnimationCss({
      clip,
      boxes: new Map([['other', BOX]]),
      sceneDurationMs: 2000,
      scopeId: 's',
    });
    expect(css).toBe('');
    expect(bindings.size).toBe(0);
  });
});
