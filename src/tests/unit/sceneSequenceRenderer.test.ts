import { describe, expect, it, vi } from 'vitest';
import type { CalqoProject } from '@/lib/schema';
import {
  createSceneSequenceRenderer,
  type SceneCompositor,
} from '@/editor/rendering/sceneSequenceRenderer';
import type { FrameSource, OffscreenScene } from '@/editor/rendering/offscreenScene';

const ISO = '2026-07-20T00:00:00.000Z';

function artboard(id: string, durationMs = 2000): CalqoProject['artboards'][number] {
  return {
    id,
    name: id,
    preset: 'ig-square',
    width: 1080,
    height: 1080,
    background: { type: 'solid', color: '#FFFFFF' },
    timing: { duration: durationMs },
    layers: [],
  };
}

function project(): CalqoProject {
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
    clipSettings: {
      fps: 30,
      scenes: [
        { artboardId: 'a' },
        { artboardId: 'b', transition: 'fade', transitionDurationMs: 400 },
        { artboardId: 'c', transition: 'slide', transitionDurationMs: 400 },
      ],
    },
  };
}

/** A fake offscreen scene tagged by artboard id, so draw calls are identifiable. */
function fakeScene(id: string, disposed: Set<string>): OffscreenScene {
  const source = { __artboardId: id } as unknown as FrameSource;
  return {
    width: 1080,
    height: 1080,
    applyOverrides: vi.fn(),
    resetToIdentity: vi.fn(),
    render: vi.fn(),
    capture: () => ({ width: 1080, height: 1080, source }),
    dispose: vi.fn(() => disposed.add(id)),
  };
}

interface DrawCall {
  id: string;
  offsetX: number;
  alpha: number;
}

function recordingCompositor(): { compositor: SceneCompositor; calls: DrawCall[]; clears: number } {
  const state = { calls: [] as DrawCall[], clears: 0 };
  const compositor: SceneCompositor = {
    canvas: {} as FrameSource,
    clear() {
      state.clears += 1;
    },
    draw(source, offsetX, alpha) {
      state.calls.push({
        id: (source as unknown as { __artboardId: string }).__artboardId,
        offsetX,
        alpha,
      });
    },
  };
  return { compositor, ...state, get calls() { return state.calls; }, get clears() { return state.clears; } };
}

describe('scene sequence renderer (AN-4.2b)', () => {
  it('draws a single scene during scene content', async () => {
    const disposed = new Set<string>();
    const rec = recordingCompositor();
    const created: string[] = [];
    const renderer = await createSceneSequenceRenderer({
      project: project(),
      locale: 'en',
      outputWidth: 1080,
      outputHeight: 1080,
      createScene: async ({ artboard: a }) => {
        created.push(a.id);
        return fakeScene(a.id, disposed);
      },
      createCompositor: () => rec.compositor,
    });
    await renderer.renderAt(1000); // inside scene a
    expect(rec.calls).toEqual([{ id: 'a', offsetX: 0, alpha: 1 }]);
    renderer.dispose();
  });

  it('crossfades during a fade transition', async () => {
    const disposed = new Set<string>();
    const rec = recordingCompositor();
    const renderer = await createSceneSequenceRenderer({
      project: project(),
      locale: 'en',
      outputWidth: 1080,
      outputHeight: 1080,
      createScene: async ({ artboard: a }) => fakeScene(a.id, disposed),
      createCompositor: () => rec.compositor,
    });
    // a:[0,2000], fade 400 -> b starts at 2400; midpoint 2200.
    await renderer.renderAt(2200);
    expect(rec.calls).toEqual([
      { id: 'a', offsetX: 0, alpha: 1 },
      { id: 'b', offsetX: 0, alpha: 0.5 },
    ]);
    renderer.dispose();
  });

  it('offsets both scenes during a slide transition', async () => {
    const disposed = new Set<string>();
    const rec = recordingCompositor();
    const renderer = await createSceneSequenceRenderer({
      project: project(),
      locale: 'en',
      outputWidth: 1080,
      outputHeight: 1080,
      createScene: async ({ artboard: a }) => fakeScene(a.id, disposed),
      createCompositor: () => rec.compositor,
    });
    // b:[2400,4400], slide 400 -> c starts at 4800; midpoint 4600 (progress .5).
    await renderer.renderAt(4600);
    expect(rec.calls).toEqual([
      { id: 'b', offsetX: -540, alpha: 1 },
      { id: 'c', offsetX: 540, alpha: 1 },
    ]);
    renderer.dispose();
  });

  it('bounds live scenes to the memory budget and disposes evicted scenes', async () => {
    const disposed = new Set<string>();
    const renderer = await createSceneSequenceRenderer({
      project: project(),
      locale: 'en',
      outputWidth: 1080,
      outputHeight: 1080,
      memoryBudgetScenes: 2,
      createScene: async ({ artboard: a }) => fakeScene(a.id, disposed),
      createCompositor: () => recordingCompositor().compositor,
    });
    await renderer.renderAt(1000); // a
    await renderer.renderAt(2200); // a+b (fade)
    await renderer.renderAt(3000); // b
    await renderer.renderAt(4600); // b+c (slide) -> a evicted
    expect(renderer.liveSceneCount()).toBeLessThanOrEqual(2);
    expect(disposed.has('a')).toBe(true);
    renderer.dispose();
    expect(disposed.has('b')).toBe(true);
    expect(disposed.has('c')).toBe(true);
  });
});
