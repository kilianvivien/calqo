import { describe, expect, it } from 'vitest';
import {
  createTauriVideoToolboxAdapter,
  VT_COMMANDS,
  type TauriVideoRuntime,
} from '@/lib/adapters/video/tauriVideoToolboxAdapter';
import { createSelectingVideoExportAdapter } from '@/lib/adapters/video/selectingVideoExportAdapter';
import type {
  VideoExportAdapter,
  VideoExportBeginConfig,
  VideoSinkChunk,
} from '@/lib/adapters/video/VideoExportAdapter';
import { unavailableCapabilities } from '@/lib/adapters/video/VideoExportAdapter';

/** A fake scene canvas whose getImageData returns a fixed-size RGBA buffer. */
function fakeCanvas(width: number, height: number): HTMLCanvasElement {
  const data = new Uint8ClampedArray(width * height * 4).fill(200);
  return {
    getContext: () => ({ getImageData: () => ({ data, width, height }) }),
  } as unknown as HTMLCanvasElement;
}

interface RuntimeCalls {
  runtime: TauriVideoRuntime;
  calls: Array<{ command: string; args?: Record<string, unknown> }>;
  removed: string[];
}

function mockRuntime(overrides: Partial<TauriVideoRuntime> = {}): RuntimeCalls {
  const calls: RuntimeCalls['calls'] = [];
  const removed: string[] = [];
  const runtime: TauriVideoRuntime = {
    isTauri: true,
    async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      calls.push({ command, args });
      if (command === VT_COMMANDS.probe) {
        return { available: true, h264: true, h265: false, powerEfficient: true } as T;
      }
      if (command === VT_COMMANDS.finalize) {
        return { path: '/tmp/out.mp4', byteLength: 1234 } as T;
      }
      return { ok: true } as T;
    },
    async readFile(): Promise<Uint8Array> {
      return new Uint8Array([1, 2, 3, 4]);
    },
    async removeFile(path: string): Promise<void> {
      removed.push(path);
    },
    ...overrides,
  };
  return { runtime, calls, removed };
}

const PROBE = { width: 1080, height: 1920, fps: 30 };

function beginConfig(over: Partial<VideoExportBeginConfig> = {}): VideoExportBeginConfig {
  return {
    codec: 'h264',
    width: 1080,
    height: 1920,
    fps: 30,
    canvas: fakeCanvas(1080, 1920),
    sink: { kind: 'buffer' },
    ...over,
  };
}

describe('tauriVideoToolboxAdapter capabilities', () => {
  it('reports unavailable on a non-Tauri runtime', async () => {
    const { runtime } = mockRuntime({ isTauri: false });
    const adapter = createTauriVideoToolboxAdapter(async () => runtime);
    const caps = await adapter.capabilities(PROBE);
    expect(caps.codecs.h264.supported).toBe(false);
  });

  it('maps the native probe to per-codec capabilities', async () => {
    const { runtime } = mockRuntime();
    const adapter = createTauriVideoToolboxAdapter(async () => runtime);
    const caps = await adapter.capabilities(PROBE);
    expect(caps.codecs.h264).toMatchObject({ supported: true, powerEfficient: true });
    expect(caps.codecs.h265.supported).toBe(false);
    expect(caps.streamingSupported).toBe(true);
  });

  it('reports unavailable when the probe throws', async () => {
    const { runtime } = mockRuntime({
      invoke: async () => {
        throw new Error('no native encoder');
      },
    });
    const adapter = createTauriVideoToolboxAdapter(async () => runtime);
    const caps = await adapter.capabilities(PROBE);
    expect(caps.codecs.h264.supported).toBe(false);
  });
});

describe('tauriVideoToolboxAdapter session', () => {
  it('begins, streams frames with pixel read-back, and finalizes to a Blob', async () => {
    const { runtime, calls, removed } = mockRuntime();
    const adapter = createTauriVideoToolboxAdapter(async () => runtime);
    const session = await adapter.begin(beginConfig());

    await session.addFrame(0, 33333);
    await session.addFrame(33333, 33333);
    const result = await session.finalize();

    expect(calls[0].command).toBe(VT_COMMANDS.begin);
    const frameCalls = calls.filter((c) => c.command === VT_COMMANDS.addFrame);
    expect(frameCalls).toHaveLength(2);
    // RGBA is passed as an ArrayBuffer of exactly w*h*4 bytes.
    const rgba = frameCalls[0].args?.rgba as ArrayBuffer;
    expect(rgba.byteLength).toBe(1080 * 1920 * 4);
    expect(frameCalls[0].args?.timestampMicros).toBe(0);

    expect(result.streamed).toBe(false);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(removed).toEqual(['/tmp/out.mp4']); // temp cleaned up
  });

  it('pipes the finished file to a stream sink in chunks', async () => {
    const written: VideoSinkChunk[] = [];
    const writable = new WritableStream<VideoSinkChunk>({
      write(chunk) {
        written.push(chunk);
      },
    });
    const { runtime, removed } = mockRuntime({
      async readFile() {
        return new Uint8Array(3 * (1 << 20)).fill(7); // 3 MiB → 3 chunks
      },
    });
    const adapter = createTauriVideoToolboxAdapter(async () => runtime);
    const session = await adapter.begin(beginConfig({ sink: { kind: 'stream', writable } }));
    const result = await session.finalize();

    expect(result.streamed).toBe(true);
    expect(written).toHaveLength(3);
    expect(written[0].position).toBe(0);
    expect(written[1].position).toBe(1 << 20);
    expect(removed).toEqual(['/tmp/out.mp4']);
  });

  it('aborts a frame when the signal is set and cancels the session', async () => {
    const { runtime, calls } = mockRuntime();
    const controller = new AbortController();
    const adapter = createTauriVideoToolboxAdapter(async () => runtime);
    const session = await adapter.begin(beginConfig({ signal: controller.signal }));
    controller.abort();
    await expect(session.addFrame(0, 33333)).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.some((c) => c.command === VT_COMMANDS.cancel)).toBe(true);
  });

  it('cancel is idempotent and safe after finalize', async () => {
    const { runtime, calls } = mockRuntime();
    const adapter = createTauriVideoToolboxAdapter(async () => runtime);
    const session = await adapter.begin(beginConfig());
    await session.cancel();
    await session.cancel();
    const cancels = calls.filter((c) => c.command === VT_COMMANDS.cancel);
    expect(cancels).toHaveLength(1);
  });
});

/** A tiny fake adapter for the selecting-adapter tests. */
function fakeAdapter(
  h264Supported: boolean,
  onBegin: () => Promise<never> | Promise<VideoExportSessionStub>,
): VideoExportAdapter & { began: number } {
  const adapter = {
    began: 0,
    async capabilities(probe) {
      if (!h264Supported) return unavailableCapabilities(probe, 'codec-unsupported');
      return {
        codecs: {
          h264: { supported: true, powerEfficient: true },
          h265: { supported: false, reason: 'codec-unsupported' as const },
        },
        streamingSupported: true,
        maxTestedWidth: probe.width,
        maxTestedHeight: probe.height,
        maxTestedFps: probe.fps,
      };
    },
    async begin() {
      adapter.began += 1;
      return (await onBegin()) as unknown as VideoExportSessionStub;
    },
  };
  return adapter as unknown as VideoExportAdapter & { began: number };
}

type VideoExportSessionStub = {
  addFrame: () => Promise<void>;
  finalize: () => Promise<{ streamed: boolean; byteLength: number }>;
  cancel: () => Promise<void>;
};

const okSession: VideoExportSessionStub = {
  addFrame: async () => {},
  finalize: async () => ({ streamed: false, byteLength: 0 }),
  cancel: async () => {},
};

describe('selectingVideoExportAdapter', () => {
  it('routes to native when it supports the codec', async () => {
    const native = fakeAdapter(true, async () => okSession);
    const webcodecs = fakeAdapter(true, async () => okSession);
    const adapter = createSelectingVideoExportAdapter(native, webcodecs);
    const caps = await adapter.capabilities(PROBE);
    expect(caps.codecs.h264.powerEfficient).toBe(true);
    await adapter.begin(beginConfig());
    expect(native.began).toBe(1);
    expect(webcodecs.began).toBe(0);
  });

  it('falls back to WebCodecs when native lacks the codec', async () => {
    const native = fakeAdapter(false, async () => okSession);
    const webcodecs = fakeAdapter(true, async () => okSession);
    const adapter = createSelectingVideoExportAdapter(native, webcodecs);
    await adapter.capabilities(PROBE);
    await adapter.begin(beginConfig());
    expect(native.began).toBe(0);
    expect(webcodecs.began).toBe(1);
  });

  it('falls back to WebCodecs when a native session fails to start', async () => {
    const native = fakeAdapter(true, async () => {
      throw new Error('native begin failed');
    });
    const webcodecs = fakeAdapter(true, async () => okSession);
    const adapter = createSelectingVideoExportAdapter(native, webcodecs);
    await adapter.capabilities(PROBE);
    await adapter.begin(beginConfig());
    expect(native.began).toBe(1);
    expect(webcodecs.began).toBe(1);
  });

  it('defaults to WebCodecs when begin is called before capabilities', async () => {
    const native = fakeAdapter(true, async () => okSession);
    const webcodecs = fakeAdapter(true, async () => okSession);
    const adapter = createSelectingVideoExportAdapter(native, webcodecs);
    await adapter.begin(beginConfig());
    expect(webcodecs.began).toBe(1);
    expect(native.began).toBe(0);
  });
});
