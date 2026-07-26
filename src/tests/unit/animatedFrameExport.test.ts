import { describe, expect, it, vi } from 'vitest';
import {
  exportAnimatedVideo,
  frameCountFor,
  frameTimestampMicros,
} from '@/editor/export/animatedFrameExport';
import type { OffscreenScene } from '@/editor/rendering/offscreenScene';
import type {
  VideoExportAdapter,
  VideoExportSession,
} from '@/lib/adapters/video/VideoExportAdapter';
import { v2AllPresetsProject } from '../fixtures/animation/fixtures';

function fixture() {
  const project = structuredClone(v2AllPresetsProject);
  project.clipSettings = { fps: 30 };
  project.artboards[0].timing = { duration: 100 };
  project.artboards[0].width = 1079;
  project.artboards[0].height = 1919;
  return { project, artboard: project.artboards[0] };
}

function sceneDouble(events: string[]): OffscreenScene {
  const canvas = document.createElement('canvas');
  return {
    width: 1080,
    height: 1920,
    applyOverrides: vi.fn(() => events.push('apply')),
    applyFragmentOverrides: vi.fn(() => events.push('fragments')),
    resetToIdentity: vi.fn(),
    render: vi.fn(() => events.push('render')),
    capture: vi.fn(() => ({ width: 1080, height: 1920, source: canvas })),
    dispose: vi.fn(() => events.push('dispose')),
  };
}

/** A one-artboard project whose single top-level text layer reveals per word. */
function revealFixture() {
  const project = structuredClone(v2AllPresetsProject);
  project.clipSettings = { fps: 30 };
  const artboard = project.artboards[0];
  artboard.timing = { duration: 100 };
  artboard.layers = [
    {
      id: 'title',
      name: 'Title',
      type: 'text',
      x: 0,
      y: 0,
      w: 800,
      h: 200,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: { en: 'one two three' },
      style: {
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 700,
        fontStyle: 'normal',
        textDecoration: 'none',
        color: '#000000',
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      animation: { mode: 'preset', enter: { kind: 'word-rise', duration: 60, delay: 0 } },
    },
  ] as never;
  return { project, artboard };
}

describe('animated MP4 frame orchestration', () => {
  it('derives frame counts and timestamps from integer frame indices', () => {
    expect(frameCountFor(5_000, 30)).toBe(150);
    expect(frameCountFor(1, 30)).toBe(1);
    expect(frameTimestampMicros(0, 30)).toBe(0);
    expect(frameTimestampMicros(1, 30)).toBe(33_333);
    expect(frameTimestampMicros(1_799, 30)).toBe(59_966_667);
  });

  it('renders sequentially with backpressure, progress, and guaranteed cleanup', async () => {
    const { project, artboard } = fixture();
    const events: string[] = [];
    const scene = sceneDouble(events);
    const addFrame = vi.fn(async (timestamp: number) => {
      events.push(`frame:${timestamp}`);
    });
    const session: VideoExportSession = {
      addFrame,
      finalize: vi.fn(async () => {
        events.push('finalize');
        return { blob: new Blob(['mp4']), streamed: false, byteLength: 3 };
      }),
      cancel: vi.fn(),
    };
    const adapter: VideoExportAdapter = {
      capabilities: vi.fn(),
      begin: vi.fn(async () => session),
    };
    const progress = vi.fn();

    const result = await exportAnimatedVideo({
      project,
      artboard,
      locale: 'en',
      codec: 'h264',
      adapter,
      createScene: vi.fn(async () => scene),
      onProgress: progress,
    });

    expect(addFrame.mock.calls.map(([timestamp]) => timestamp)).toEqual([0, 33_333, 66_667]);
    expect(events).toEqual([
      'apply', 'render', 'frame:0',
      'apply', 'render', 'frame:33333',
      'apply', 'render', 'frame:66667',
      'finalize', 'dispose',
    ]);
    expect(progress.mock.calls.map(([value]) => value.phase)).toEqual([
      'preparing', 'rendering', 'rendering', 'rendering', 'finalizing',
    ]);
    expect(result).toMatchObject({
      streamed: false,
      byteLength: 3,
      width: 1080,
      height: 1920,
      fps: 30,
      frameCount: 3,
    });
    expect(session.cancel).not.toHaveBeenCalled();
  });

  it('drives text-reveal fragments into the scene each frame (AN-3.5)', async () => {
    const { project, artboard } = revealFixture();
    const events: string[] = [];
    const scene = sceneDouble(events);
    const createScene = vi.fn(async () => scene);
    const session: VideoExportSession = {
      addFrame: vi.fn(async () => {}),
      finalize: vi.fn(async () => ({ blob: new Blob(['mp4']), streamed: false, byteLength: 3 })),
      cancel: vi.fn(),
    };
    const adapter: VideoExportAdapter = {
      capabilities: vi.fn(),
      begin: vi.fn(async () => session),
    };

    await exportAnimatedVideo({
      project,
      artboard,
      locale: 'en',
      codec: 'h264',
      adapter,
      createScene,
    });

    // The scene is created with the compiled fragment animation…
    const sceneInput = createScene.mock.calls[0][0] as { fragments?: unknown[] };
    expect(sceneInput.fragments).toHaveLength(1);
    // …and every rendered frame applies both layer and fragment overrides.
    expect(events.filter((e) => e === 'fragments').length).toBeGreaterThan(0);
    expect(scene.applyFragmentOverrides).toHaveBeenCalled();
  });

  it('propagates abort, cancels a partial session, and disposes the scene', async () => {
    const { project, artboard } = fixture();
    const controller = new AbortController();
    const scene = sceneDouble([]);
    const session: VideoExportSession = {
      addFrame: vi.fn(async () => controller.abort()),
      finalize: vi.fn(),
      cancel: vi.fn(),
    };
    const adapter: VideoExportAdapter = {
      capabilities: vi.fn(),
      begin: vi.fn(async () => session),
    };

    await expect(exportAnimatedVideo({
      project,
      artboard,
      locale: 'en',
      codec: 'h264',
      adapter,
      createScene: vi.fn(async () => scene),
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(session.addFrame).toHaveBeenCalledTimes(1);
    expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(session.finalize).not.toHaveBeenCalled();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });
});
