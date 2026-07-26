import { describe, it, expect, beforeEach } from 'vitest';
import type { CalqoArtboard, LayerAnimation } from '@/lib/schema';
import {
  compileClip,
  compileClipCached,
  invalidateClipCache,
  invalidateProjectClips,
  clipCacheSize,
  type CompileClipInput,
} from '@/editor/animation/compiler';

function artboard(
  animation: LayerAnimation | undefined,
  opts: { duration?: number; x?: number; name?: string } = {},
): CalqoArtboard {
  return {
    id: 'ab',
    name: 'a',
    preset: 'ig-square',
    width: 1080,
    height: 1080,
    background: { type: 'solid', color: '#ffffff' },
    ...(opts.duration ? { timing: { duration: opts.duration } } : {}),
    layers: [
      {
        id: 's',
        name: opts.name ?? 's',
        type: 'shape',
        shape: 'rect',
        x: opts.x ?? 0,
        y: 0,
        w: 100,
        h: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: { type: 'solid', color: '#000000' },
        ...(animation ? { animation } : {}),
      },
    ],
  } as unknown as CalqoArtboard;
}

function input(
  animation: LayerAnimation | undefined,
  opts: Parameters<typeof artboard>[1] = {},
): CompileClipInput {
  return { projectId: 'p', artboard: artboard(animation, opts), locale: 'en', fps: 30 };
}

const firstWindows = (animation: LayerAnimation, opts?: Parameters<typeof artboard>[1]) => {
  const { clip, issues } = compileClip(input(animation, opts));
  return { windows: clip.layers[0]?.windows ?? [], issues, clip };
};

describe('preset compiler — enter/exit shapes', () => {
  it('compiles fade enter to a single opacity 0→1 track', () => {
    const { windows } = firstWindows({ mode: 'preset', enter: { kind: 'fade', duration: 500, delay: 0 } });
    expect(windows).toHaveLength(1);
    const track = windows[0].tracks.find((t) => t.prop === 'opacity')!;
    expect(track.keyframes[0].value).toBe(0);
    expect(track.keyframes[track.keyframes.length - 1].value).toBe(1);
  });

  it('compiles slide-up enter to a dy track from +distance to 0', () => {
    const { windows } = firstWindows({
      mode: 'preset',
      enter: { kind: 'slide', duration: 600, delay: 0, direction: 'up', distance: 100 },
    });
    const dy = windows[0].tracks.find((t) => t.prop === 'dy')!;
    expect(dy.keyframes[0].value).toBe(100);
    expect(dy.keyframes[dy.keyframes.length - 1].value).toBe(0);
  });

  it('anchors an exit window to the scene end and fades opacity 1→0', () => {
    const { windows } = firstWindows(
      { mode: 'preset', exit: { kind: 'fade', duration: 500, delay: 0 } },
      { duration: 4000 },
    );
    const w = windows[0];
    expect(w.start + w.duration).toBeCloseTo(4000);
    const op = w.tracks.find((t) => t.prop === 'opacity')!;
    expect(op.keyframes[0].value).toBe(1);
    expect(op.keyframes[op.keyframes.length - 1].value).toBe(0);
  });

  it('compiles pop enter to scale + opacity tracks', () => {
    const { windows } = firstWindows({ mode: 'preset', enter: { kind: 'pop', duration: 500, delay: 0 } });
    const props = windows[0].tracks.map((t) => t.prop).sort();
    expect(props).toEqual(['opacity', 'scaleX', 'scaleY']);
  });

  it('compiles wipe enter with a wipeDirection hint', () => {
    const { windows } = firstWindows({
      mode: 'preset',
      enter: { kind: 'wipe', duration: 600, delay: 0, direction: 'right' },
    });
    expect(windows[0].wipeDirection).toBe('right');
    expect(windows[0].tracks[0].prop).toBe('wipe-progress');
  });

  it('compiles blur-in enter to blur + opacity tracks settling to 0 blur', () => {
    const { windows } = firstWindows({ mode: 'preset', enter: { kind: 'blur-in', duration: 600, delay: 0 } });
    const blur = windows[0].tracks.find((t) => t.prop === 'blur')!;
    expect(blur.keyframes[0].value).toBeGreaterThan(0);
    expect(blur.keyframes[blur.keyframes.length - 1].value).toBe(0);
  });
});

describe('preset compiler — emphasis', () => {
  it('produces finite pulse tracks that settle to identity at both ends', () => {
    const { windows } = firstWindows(
      { mode: 'preset', emphasis: { kind: 'pulse', duration: 800, delay: 0 } },
      { duration: 4000 },
    );
    const scaleX = windows[0].tracks.find((t) => t.prop === 'scaleX')!;
    expect(scaleX.keyframes[0].value).toBe(1);
    expect(scaleX.keyframes[scaleX.keyframes.length - 1].value).toBe(1);
    // strictly increasing times, all finite
    for (let i = 1; i < scaleX.keyframes.length; i++) {
      expect(scaleX.keyframes[i].t).toBeGreaterThan(scaleX.keyframes[i - 1].t);
      expect(Number.isFinite(scaleX.keyframes[i].value)).toBe(true);
    }
  });

  it('caps the emphasis loop frequency below the photosensitivity limit', () => {
    // Request a 60 ms period over a 4 s window; loops must be clamped.
    const { windows } = firstWindows(
      { mode: 'preset', emphasis: { kind: 'wiggle', duration: 60, delay: 0 } },
      { duration: 4000 },
    );
    const rot = windows[0].tracks.find((t) => t.prop === 'rotation')!;
    // one loop = 4 keyframes; count loops from unique seams.
    const loops = (rot.keyframes.length - 1) / 3;
    // 4000ms / 334ms floor => at most 11 loops
    expect(loops).toBeLessThanOrEqual(11);
  });
});

describe('preset compiler — slot layout', () => {
  it('lays out enter, emphasis, and exit as non-overlapping windows', () => {
    const anim: LayerAnimation = {
      mode: 'preset',
      enter: { kind: 'fade', duration: 400, delay: 0 },
      emphasis: { kind: 'pulse', duration: 800, delay: 0 },
      exit: { kind: 'fade', duration: 400, delay: 0 },
    };
    const { windows } = firstWindows(anim, { duration: 4000 });
    const sorted = [...windows].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(
        sorted[i - 1].start + sorted[i - 1].duration - 1e-6,
      );
    }
  });

  it('flags an unsupported slot/preset combination with a structured issue', () => {
    const anim = { mode: 'preset', enter: { kind: 'pulse', duration: 400, delay: 0 } } as unknown as LayerAnimation;
    const { issues, windows } = firstWindows(anim, { duration: 4000 });
    expect(windows).toHaveLength(0);
    expect(issues[0]).toMatchObject({ layerId: 's', slot: 'enter', code: 'unsupported-slot' });
  });
});

describe('preset compiler — custom tracks', () => {
  it('passes custom windows through with default easing filled', () => {
    const anim: LayerAnimation = {
      mode: 'custom',
      windows: [
        { start: 100, duration: 500, tracks: [{ prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 50 }] }] },
      ],
    };
    const { windows } = firstWindows(anim, { duration: 3000 });
    expect(windows[0].start).toBe(100);
    expect(windows[0].tracks[0].keyframes[1].easing).toBe('ease-in-out');
  });
});

describe('compiler cache — invalidation contract (§8)', () => {
  beforeEach(() => invalidateClipCache());

  const anim: LayerAnimation = { mode: 'preset', enter: { kind: 'fade', duration: 400, delay: 0 } };

  it('is deterministic: same inputs produce structurally identical output', () => {
    const a = compileClip(input(anim));
    const b = compileClip(input(anim));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('hits on object-identity change and irrelevant edits, misses on layout edits', () => {
    compileClipCached(input(anim));
    expect(clipCacheSize()).toBe(1);
    // Fresh object graph, same content → hit.
    compileClipCached(input(anim));
    expect(clipCacheSize()).toBe(1);
    // Renaming the layer is not layout-affecting → hit.
    compileClipCached(input(anim, { name: 'renamed' }));
    expect(clipCacheSize()).toBe(1);
    // Moving the layer is layout-affecting → miss.
    compileClipCached(input(anim, { x: 40 }));
    expect(clipCacheSize()).toBe(2);
  });

  it('invalidates only the targeted project', () => {
    compileClipCached(input(anim));
    invalidateProjectClips('other');
    expect(clipCacheSize()).toBe(1);
    invalidateProjectClips('p');
    expect(clipCacheSize()).toBe(0);
  });
});
