import { describe, expect, it, vi } from 'vitest';
import type { CalqoProject } from '@/lib/schema';
import {
  exportAnimatedSceneVideo,
  exportAnimatedSceneGif,
} from '@/editor/export/animatedSceneExport';
import { resolveSequence } from '@/editor/animation/sceneSequence';
import type { SceneSequenceRenderer } from '@/editor/rendering/sceneSequenceRenderer';
import type { FrameSource } from '@/editor/rendering/offscreenScene';
import type {
  VideoExportAdapter,
  VideoExportSession,
} from '@/lib/adapters/video/VideoExportAdapter';
import type { GifEncoderClient } from '@/editor/export/gif/gifExport';

const ISO = '2026-07-20T00:00:00.000Z';

function artboard(id: string, durationMs = 1000): CalqoProject['artboards'][number] {
  return {
    id,
    name: id,
    preset: 'ig-square',
    width: 1079, // odd on purpose to exercise even-dimension padding
    height: 1079,
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
        { artboardId: 'c', transition: 'cut' },
      ],
    },
  };
}

// total = 1000 + 400 + 1000 + 0 + 1000 = 3400ms -> round(3.4*30) = 102 frames.
const EXPECTED_FRAMES = 102;

function fakeRenderer(p: CalqoProject, rendered: number[]): SceneSequenceRenderer {
  return {
    canvas: {} as FrameSource,
    sequence: resolveSequence(p)!,
    renderAt: vi.fn(async (ms: number) => {
      rendered.push(ms);
    }),
    liveSceneCount: () => 2,
    dispose: vi.fn(),
  };
}

describe('multi-scene MP4 export (AN-4.2c)', () => {
  it('renders every clip frame, pads to even dimensions, reports scene progress', async () => {
    const p = project();
    const rendered: number[] = [];
    const renderer = fakeRenderer(p, rendered);
    const addFrame = vi.fn(async () => {});
    const session: VideoExportSession = {
      addFrame,
      finalize: vi.fn(async () => ({ blob: new Blob(['mp4']), streamed: false, byteLength: 3 })),
      cancel: vi.fn(),
    };
    const adapter: VideoExportAdapter = {
      capabilities: vi.fn(),
      begin: vi.fn(async () => session),
    };
    const progress = vi.fn();

    const result = await exportAnimatedSceneVideo({
      project: p,
      locale: 'en',
      codec: 'h264',
      adapter,
      createRenderer: vi.fn(async () => renderer),
      onProgress: progress,
    });

    expect(result.frameCount).toBe(EXPECTED_FRAMES);
    expect(result.sceneCount).toBe(3);
    expect(result.width).toBe(1080); // 1079 padded up to even
    expect(result.height).toBe(1080);
    expect(addFrame).toHaveBeenCalledTimes(EXPECTED_FRAMES);
    expect(renderer.renderAt).toHaveBeenCalledTimes(EXPECTED_FRAMES);
    // Frame times are monotonically increasing and derived from the fps grid.
    expect(rendered[0]).toBe(0);
    expect(rendered[1]).toBeCloseTo(1000 / 30, 5);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    // Progress crosses more than one scene index over the clip.
    const sceneIndices = new Set(progress.mock.calls.map((c) => c[0].sceneIndex));
    expect(sceneIndices.size).toBeGreaterThan(1);
  });

  it('cancels the session and disposes the renderer when aborted mid-render', async () => {
    const p = project();
    const controller = new AbortController();
    const renderer = fakeRenderer(p, []);
    // Abort after the first frame renders, so cleanup runs through try/finally.
    renderer.renderAt = vi.fn(async () => {
      controller.abort();
    });
    const session: VideoExportSession = {
      addFrame: vi.fn(async () => {}),
      finalize: vi.fn(),
      cancel: vi.fn(async () => {}),
    };
    const adapter: VideoExportAdapter = {
      capabilities: vi.fn(),
      begin: vi.fn(async () => session),
    };

    await expect(
      exportAnimatedSceneVideo({
        project: p,
        locale: 'en',
        codec: 'h264',
        adapter,
        createRenderer: vi.fn(async () => renderer),
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
    expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(session.finalize).not.toHaveBeenCalled();
  });
});

describe('multi-scene GIF export (AN-4.2c)', () => {
  it('encodes capped frames and reports gif caps when reduced', async () => {
    const p = project();
    const renderer = fakeRenderer(p, []);
    const encoder: GifEncoderClient & { frames: number } = {
      frames: 0,
      init: vi.fn(),
      addFrame: vi.fn(async function (this: { frames: number }) {
        encoder.frames += 1;
      }),
      finish: vi.fn(async () => new Uint8Array([71, 73, 70])),
      cancel: vi.fn(),
    };

    const result = await exportAnimatedSceneGif({
      project: p,
      locale: 'en',
      createRenderer: vi.fn(async () => renderer),
      createEncoder: () => encoder,
      sampleFrame: () => new Uint8ClampedArray(4),
    });

    // 1080 long edge > 720 cap and 30fps > 15fps cap -> adjusted.
    expect(result.warnings.some((w) => w.code === 'gifCaps')).toBe(true);
    expect(result.width).toBeLessThanOrEqual(720);
    expect(result.fps).toBeLessThanOrEqual(15);
    expect(result.blob.type).toBe('image/gif');
    expect(encoder.frames).toBe(result.frameCount);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
