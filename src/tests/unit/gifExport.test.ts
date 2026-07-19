import { describe, expect, it, vi } from 'vitest';
import {
  createInlineGifEncoder,
  exportAnimatedGif,
  type GifEncoderClient,
} from '@/editor/export/gif/gifExport';
import type { OffscreenScene } from '@/editor/rendering/offscreenScene';
import { v2AllPresetsProject } from '../fixtures/animation/fixtures';

function sceneDouble(): OffscreenScene {
  const canvas = document.createElement('canvas');
  return {
    width: 1080,
    height: 1920,
    applyOverrides: vi.fn(),
    resetToIdentity: vi.fn(),
    render: vi.fn(),
    capture: vi.fn(() => ({ width: 1080, height: 1920, source: canvas })),
    dispose: vi.fn(),
  };
}

function fixture() {
  const project = structuredClone(v2AllPresetsProject);
  project.clipSettings = { fps: 30 };
  project.artboards[0].timing = { duration: 100 };
  project.artboards[0].width = 1080;
  project.artboards[0].height = 1920;
  return { project, artboard: project.artboards[0] };
}

describe('animated GIF export', () => {
  it('renders the capped plan, applies encoder backpressure, and reports a cap warning', async () => {
    const { project, artboard } = fixture();
    const scene = sceneDouble();
    const encoder: GifEncoderClient = {
      init: vi.fn(),
      addFrame: vi.fn(async () => undefined),
      finish: vi.fn(async () => new Uint8Array([71, 73, 70])),
      cancel: vi.fn(),
    };
    const progress = vi.fn();

    const result = await exportAnimatedGif({
      project,
      artboard,
      locale: 'en',
      createScene: vi.fn(async () => scene),
      createEncoder: () => encoder,
      sampleFrame: () => new Uint8ClampedArray(405 * 720 * 4),
      onProgress: progress,
    });

    expect(encoder.init).toHaveBeenCalledWith(405, 720, 67);
    expect(encoder.addFrame).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.map(([value]) => value.completedFrames)).toEqual([1, 2]);
    expect(result).toMatchObject({
      byteLength: 3,
      width: 405,
      height: 720,
      fps: 15,
      frameCount: 2,
      warnings: [{ code: 'gifCaps' }],
    });
    expect(result.blob.type).toBe('image/gif');
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(encoder.cancel).not.toHaveBeenCalled();
  });

  it('cancels the encoder and disposes the scene when aborted between frames', async () => {
    const { project, artboard } = fixture();
    const controller = new AbortController();
    const scene = sceneDouble();
    const encoder: GifEncoderClient = {
      init: vi.fn(),
      addFrame: vi.fn(async () => controller.abort()),
      finish: vi.fn(),
      cancel: vi.fn(),
    };

    await expect(exportAnimatedGif({
      project,
      artboard,
      locale: 'en',
      signal: controller.signal,
      createScene: vi.fn(async () => scene),
      createEncoder: () => encoder,
      sampleFrame: () => new Uint8ClampedArray(405 * 720 * 4),
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(encoder.addFrame).toHaveBeenCalledTimes(1);
    expect(encoder.finish).not.toHaveBeenCalled();
    expect(encoder.cancel).toHaveBeenCalledTimes(1);
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  it('produces a looping GIF89a stream with the inline fallback encoder', async () => {
    const encoder = createInlineGifEncoder();
    encoder.init(1, 1, 67);
    await encoder.addFrame(new Uint8ClampedArray([255, 0, 0, 255]));
    const bytes = await encoder.finish();
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a');
    expect(bytes.at(-1)).toBe(0x3b);
  });
});
