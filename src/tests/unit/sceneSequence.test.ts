import { describe, expect, it } from 'vitest';
import { projectSchema, type CalqoProject } from '@/lib/schema';
import {
  resolveSequence,
  sampleSequence,
  validateSceneSequence,
} from '@/editor/animation/sceneSequence';

const ISO = '2026-07-20T00:00:00.000Z';

function artboard(id: string, w = 1080, h = 1080, durationMs = 3000): CalqoProject['artboards'][number] {
  return {
    id,
    name: id,
    preset: 'ig-square',
    width: w,
    height: h,
    background: { type: 'solid', color: '#FFFFFF' },
    timing: { duration: durationMs },
    layers: [],
  };
}

function project(scenes: CalqoProject['clipSettings'] extends infer C ? C : never): CalqoProject {
  return {
    schemaVersion: 2,
    id: 'p',
    name: 'Clip',
    createdAt: ISO,
    updatedAt: ISO,
    contentLocales: ['en'],
    activeContentLocale: 'en',
    palette: [],
    assets: [],
    glossary: [],
    artboards: [artboard('a'), artboard('b'), artboard('c')],
    clipSettings: scenes,
  };
}

describe('scene sequence model (AN-4.2a)', () => {
  it('resolves a timeline with transitions inserted between scenes', () => {
    const p = project({
      fps: 30,
      scenes: [
        { artboardId: 'a' },
        { artboardId: 'b', transition: 'fade', transitionDurationMs: 400 },
        { artboardId: 'c', transition: 'cut' },
      ],
    });
    const seq = resolveSequence(p)!;
    expect(seq).not.toBeNull();
    // a: [0,3000], fade 400, b: [3400,6400], cut 0, c: [6400,9400]
    expect(seq.scenes[0].startMs).toBe(0);
    expect(seq.scenes[1].startMs).toBe(3400);
    expect(seq.scenes[1].transitionIn).toEqual({ kind: 'fade', durationMs: 400 });
    expect(seq.scenes[2].startMs).toBe(6400);
    expect(seq.totalMs).toBe(9400);
    expect(seq.width).toBe(1080);
  });

  it('returns null when there is no multi-scene clip', () => {
    expect(resolveSequence(project({ fps: 30 }))).toBeNull();
    expect(resolveSequence(project({ fps: 30, scenes: [] }))).toBeNull();
  });

  it('samples scene content and transition windows by absolute time', () => {
    const p = project({
      fps: 30,
      scenes: [
        { artboardId: 'a' },
        { artboardId: 'b', transition: 'slide', transitionDurationMs: 500 },
      ],
    });
    const seq = resolveSequence(p)!;
    // Inside scene a.
    const s0 = sampleSequence(seq, 1500);
    expect(s0.kind).toBe('scene');
    if (s0.kind === 'scene') {
      expect(s0.scene.artboardId).toBe('a');
      expect(s0.localMs).toBe(1500);
    }
    // Middle of the slide transition (a end -> b start): 3000..3500.
    const st = sampleSequence(seq, 3250);
    expect(st.kind).toBe('transition');
    if (st.kind === 'transition') {
      expect(st.from.artboardId).toBe('a');
      expect(st.to.artboardId).toBe('b');
      expect(st.progress).toBeCloseTo(0.5, 5);
    }
    // Inside scene b.
    const s1 = sampleSequence(seq, 4000);
    expect(s1.kind).toBe('scene');
    if (s1.kind === 'scene') {
      expect(s1.scene.artboardId).toBe('b');
      expect(s1.localMs).toBe(500);
    }
  });

  it('holds the final scene frame past the end', () => {
    const seq = resolveSequence(project({ fps: 30, scenes: [{ artboardId: 'a' }] }))!;
    const s = sampleSequence(seq, 999999);
    expect(s.kind).toBe('scene');
    if (s.kind === 'scene') expect(s.localMs).toBe(3000);
  });
});

describe('scene sequence validation (AN-4.2a)', () => {
  it('accepts a valid multi-scene clip through the schema', () => {
    const p = project({ fps: 30, scenes: [{ artboardId: 'a' }, { artboardId: 'b', transition: 'fade' }] });
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(validateSceneSequence(p)).toHaveLength(0);
  });

  it('rejects unknown, duplicate, and mismatched-size scenes', () => {
    const unknown = project({ fps: 30, scenes: [{ artboardId: 'nope' }] });
    expect(projectSchema.safeParse(unknown).success).toBe(false);
    expect(validateSceneSequence(unknown)[0].code).toBe('unknown-artboard');

    const dup = project({ fps: 30, scenes: [{ artboardId: 'a' }, { artboardId: 'a' }] });
    expect(projectSchema.safeParse(dup).success).toBe(false);
    expect(validateSceneSequence(dup).some((i) => i.code === 'duplicate-artboard')).toBe(true);

    const mixed = project({ fps: 30, scenes: [{ artboardId: 'a' }, { artboardId: 'wide' }] });
    mixed.artboards.push(artboard('wide', 1920, 1080));
    expect(projectSchema.safeParse(mixed).success).toBe(false);
    expect(validateSceneSequence(mixed).some((i) => i.code === 'size-mismatch')).toBe(true);
  });

  it('rejects a clip longer than 60s', () => {
    const p = project({
      fps: 30,
      scenes: [
        { artboardId: 'a' },
        { artboardId: 'b' },
        { artboardId: 'c' },
      ],
    });
    for (const a of p.artboards) a.timing = { duration: 25_000 };
    expect(projectSchema.safeParse(p).success).toBe(false);
    expect(validateSceneSequence(p).some((i) => i.code === 'clip-too-long')).toBe(true);
  });
});
