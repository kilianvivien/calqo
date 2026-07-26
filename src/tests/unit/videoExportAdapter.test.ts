import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({
  canEncodeVideo: vi.fn(),
  outputs: [] as Array<{ start: ReturnType<typeof vi.fn>; finalize: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }>,
  sources: [] as Array<{ add: ReturnType<typeof vi.fn>; config: unknown }>,
  bufferTargets: [] as Array<{ buffer: ArrayBuffer | null }>,
  streamTargets: [] as Array<{ writable: unknown; options: unknown }>,
}));

vi.mock('mediabunny', () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = null;
    constructor() {
      media.bufferTargets.push(this);
    }
  }
  class StreamTarget {
    constructor(public writable: unknown, public options: unknown) {
      media.streamTargets.push(this);
    }
  }
  class CanvasSource {
    add = vi.fn(async () => undefined);
    constructor(_canvas: unknown, public config: unknown) {
      media.sources.push(this);
    }
  }
  class Output {
    start = vi.fn(async () => undefined);
    finalize = vi.fn(async () => {
      const target = (this as unknown as { config: { target: BufferTarget } }).config.target;
      if (target instanceof BufferTarget) target.buffer = new Uint8Array([1, 2, 3]).buffer;
    });
    cancel = vi.fn(async () => undefined);
    addVideoTrack = vi.fn();
    constructor(public config: { target: BufferTarget | StreamTarget }) {
      media.outputs.push(this);
    }
  }
  class Mp4OutputFormat {
    constructor(public options: unknown) {}
  }
  return {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    StreamTarget,
    canEncodeVideo: media.canEncodeVideo,
  };
});

import { defaultBitrate, webCodecsVideoExportAdapter } from '@/lib/adapters/video/webCodecsVideoExportAdapter';
import { unavailableCapabilities } from '@/lib/adapters/video/VideoExportAdapter';

describe('WebCodecs video export adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.outputs.length = 0;
    media.sources.length = 0;
    media.bufferTargets.length = 0;
    media.streamTargets.length = 0;
  });

  it('uses codec-specific bitrate policy with a one-megabit floor', () => {
    expect(defaultBitrate('h264', 100, 100)).toBe(1_000_000);
    expect(defaultBitrate('h265', 1080, 1920)).toBeLessThan(
      defaultBitrate('h264', 1080, 1920),
    );
  });

  it('reports independently probed codec support and the exact probe bounds', async () => {
    media.canEncodeVideo.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await webCodecsVideoExportAdapter.capabilities({
      width: 1080,
      height: 1920,
      fps: 30,
    });
    expect(result.codecs.h264.supported).toBe(true);
    expect(result.codecs.h265).toEqual({ supported: false, reason: 'codec-unsupported' });
    expect(result).toMatchObject({
      streamingSupported: true,
      maxTestedWidth: 1080,
      maxTestedHeight: 1920,
      maxTestedFps: 30,
    });
  });

  it('captures explicit timestamps, finalizes a buffer sink, and ignores cancel after finalize', async () => {
    const session = await webCodecsVideoExportAdapter.begin({
      codec: 'h264',
      width: 1080,
      height: 1920,
      fps: 30,
      canvas: document.createElement('canvas'),
      sink: { kind: 'buffer' },
    });
    await session.addFrame(33_333, 33_333);
    expect(media.sources[0].add).toHaveBeenCalledWith(0.033333, 0.033333);
    const result = await session.finalize();
    expect(result).toMatchObject({ streamed: false, byteLength: 3 });
    expect(result.blob?.type).toBe('video/mp4');
    await session.cancel();
    expect(media.outputs[0].cancel).not.toHaveBeenCalled();
  });

  it('cancels idempotently and aborts before handing another frame to the encoder', async () => {
    const controller = new AbortController();
    const session = await webCodecsVideoExportAdapter.begin({
      codec: 'h264',
      width: 1080,
      height: 1080,
      fps: 30,
      canvas: document.createElement('canvas'),
      sink: { kind: 'buffer' },
      signal: controller.signal,
    });
    controller.abort();
    await expect(session.addFrame(0, 33_333)).rejects.toMatchObject({ name: 'AbortError' });
    await session.cancel();
    expect(media.outputs[0].cancel).toHaveBeenCalledTimes(1);
    expect(media.sources[0].add).not.toHaveBeenCalled();
  });

  it('selects a chunked stream target and returns no in-memory Blob', async () => {
    const writable = new WritableStream();
    const session = await webCodecsVideoExportAdapter.begin({
      codec: 'h264',
      width: 1080,
      height: 1080,
      fps: 30,
      canvas: document.createElement('canvas'),
      sink: { kind: 'stream', writable },
    });
    expect(media.streamTargets[0]).toMatchObject({ writable, options: { chunked: true } });
    await expect(session.finalize()).resolves.toEqual({ streamed: true, byteLength: 0 });
  });

  it('constructs an honest unavailable result for non-WebCodecs runtimes', () => {
    expect(unavailableCapabilities({ width: 640, height: 480, fps: 24 })).toEqual({
      codecs: {
        h264: { supported: false, reason: 'webcodecs-unavailable' },
        h265: { supported: false, reason: 'webcodecs-unavailable' },
      },
      streamingSupported: false,
      maxTestedWidth: 640,
      maxTestedHeight: 480,
      maxTestedFps: 24,
    });
  });
});
