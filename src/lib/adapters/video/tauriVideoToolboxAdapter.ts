import type {
  VideoCapabilities,
  VideoCapabilityProbe,
  VideoCodecId,
  VideoExportAdapter,
  VideoExportBeginConfig,
  VideoExportResult,
  VideoExportSession,
  VideoSinkChunk,
} from './VideoExportAdapter';
import { unavailableCapabilities } from './VideoExportAdapter';

/**
 * Native VideoToolbox video export adapter (plan §7, AN-4.4). On Tauri macOS it
 * routes frames to a Rust AVAssetWriter/VideoToolbox encoder — the M-series
 * hardware encoder — instead of the in-webview WebCodecs path. The adapter owns
 * the JS↔Rust protocol and matches the shared `VideoExportAdapter` contract, so
 * the frame orchestrator (`animatedFrameExport.ts`) is unchanged.
 *
 * Frame hand-off (the §7.3 risk — ~8 MB RGBA/frame): each frame's pixels are
 * read from the scene canvas and sent to Rust as an `ArrayBuffer` (Tauri v2
 * transfers it as raw bytes → `Vec<u8>`, not JSON). `addFrame` awaits the native
 * ack, which the encoder only returns once it is ready for more data, so the
 * await *is* the backpressure — no unbounded queue builds up in the webview.
 *
 * Output streams to a native temp file on disk during the encode (bounded webview
 * memory); `finalize` moves that file to the caller's sink (a Blob for the
 * download fallback, or the provided WritableStream) and deletes the temp.
 *
 * The native encoder is gated behind a default-off Cargo feature (`video-toolbox`)
 * and is macOS-only; when it is unbuilt or unavailable the probe reports every
 * codec unsupported and callers fall back to WebCodecs. Nothing here throws on a
 * non-Tauri runtime.
 */

/** The Tauri command names this adapter speaks. */
export const VT_COMMANDS = {
  probe: 'vt_probe',
  begin: 'vt_begin',
  addFrame: 'vt_add_frame',
  finalize: 'vt_finalize',
  cancel: 'vt_cancel',
} as const;

/** Shape returned by `vt_probe`. */
interface VtProbeResult {
  available: boolean;
  h264: boolean;
  h265: boolean;
  /** VideoToolbox reports whether the accelerated encoder was selected. */
  powerEfficient?: boolean;
}

/** Shape returned by `vt_finalize`: where the finished MP4 landed. */
interface VtFinalizeResult {
  path: string;
  byteLength: number;
}

/** Minimal injectable runtime surface, so the adapter is unit-testable without a
 * Tauri host. Production wires these to `@tauri-apps/api` + `plugin-fs`. */
export interface TauriVideoRuntime {
  /** `args` may be a raw `ArrayBuffer`, which Tauri transfers as an untouched
   * request body; `headers` then carries the accompanying metadata. */
  invoke<T>(
    command: string,
    args?: Record<string, unknown> | ArrayBuffer,
    options?: { headers: Record<string, string> },
  ): Promise<T>;
  /** Read a finished temp file back into memory (finalize → sink). */
  readFile(path: string): Promise<Uint8Array>;
  /** Delete the temp file after it has been moved to the sink. */
  removeFile(path: string): Promise<void>;
  /** Chance-to-bail: false on a non-Tauri runtime, so `capabilities` short-circuits. */
  isTauri: boolean;
}

/** Default runtime backed by the real Tauri APIs (lazy-imported). */
async function defaultRuntime(): Promise<TauriVideoRuntime> {
  const [{ invoke }, fs, { isTauri }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/plugin-fs'),
    import('@/lib/platform/runtime'),
  ]);
  return {
    invoke: (command, args, options) => invoke(command, args, options),
    readFile: (path) => fs.readFile(path),
    removeFile: (path) => fs.remove(path),
    isTauri,
  };
}

/** Scratch canvas reused across frames when the scene's backing store does not
 * already match the encode size (avoids allocating one per frame). */
let scaleCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

/**
 * Read the current pixels of a scene canvas as tightly-packed RGBA bytes at
 * exactly `width`×`height`.
 *
 * `getImageData(0, 0, width, height)` reads *backing-store* pixels, so if the
 * canvas is larger than the encode target (a devicePixelRatio-scaled Konva
 * layer, say) a naive read silently returns the top-left crop rather than the
 * whole frame. Scenes now pin their pixel ratio to 1, but the encoder must not
 * depend on that: rescale whenever the sizes disagree.
 */
function readCanvasRgba(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
): ArrayBuffer {
  let source = canvas;
  if (canvas.width !== width || canvas.height !== height) {
    if (!scaleCanvas) {
      scaleCanvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(width, height)
          : document.createElement('canvas');
    }
    scaleCanvas.width = width;
    scaleCanvas.height = height;
    const scaleCtx = scaleCanvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!scaleCtx) throw new Error('cannot allocate a 2D context to resize the frame');
    scaleCtx.clearRect(0, 0, width, height);
    // Draws the *whole* source, scaled to the encode size.
    scaleCtx.drawImage(canvas as CanvasImageSource, 0, 0, width, height);
    source = scaleCanvas;
  }

  const ctx = source.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('scene canvas has no 2D context for pixel read-back');
  const image = ctx.getImageData(0, 0, width, height);
  // Copy out into an exact-size, tightly-packed buffer.
  return image.data.buffer.slice(
    image.data.byteOffset,
    image.data.byteOffset + width * height * 4,
  );
}

let sessionCounter = 0;
function nextSessionId(): string {
  sessionCounter += 1;
  return `vt-${Date.now().toString(36)}-${sessionCounter}`;
}

class VideoToolboxSession implements VideoExportSession {
  private canceled = false;
  private finalized = false;

  constructor(
    private readonly runtime: TauriVideoRuntime,
    private readonly sessionId: string,
    private readonly config: VideoExportBeginConfig,
  ) {}

  async addFrame(timestampMicros: number, durationMicros: number): Promise<void> {
    if (this.canceled || this.finalized) return;
    if (this.config.signal?.aborted) {
      await this.cancel();
      throw new DOMException('Export aborted', 'AbortError');
    }
    const rgba = readCanvasRgba(
      this.config.canvas as HTMLCanvasElement | OffscreenCanvas,
      this.config.width,
      this.config.height,
    );
    // The pixels are the whole payload so Tauri sends them as a raw body rather
    // than JSON-encoding ~8 MB per frame; metadata travels in headers.
    //
    // Awaiting the ack applies backpressure: the encoder resolves only once it is
    // ready for the next frame (AVAssetWriterInput.isReadyForMoreMediaData).
    await this.runtime.invoke(VT_COMMANDS.addFrame, rgba, {
      headers: {
        'x-session-id': this.sessionId,
        'x-timestamp-micros': String(Math.round(timestampMicros)),
        'x-duration-micros': String(Math.round(durationMicros)),
      },
    });
  }

  async finalize(): Promise<VideoExportResult> {
    if (this.canceled) throw new DOMException('Export aborted', 'AbortError');
    const { path, byteLength } = await this.runtime.invoke<VtFinalizeResult>(
      VT_COMMANDS.finalize,
      { sessionId: this.sessionId },
    );
    this.finalized = true;

    // Move the finished file off disk into the caller's sink, then clean up.
    try {
      if (this.config.sink.kind === 'stream') {
        await this.pipeToStream(path, this.config.sink.writable);
        return { streamed: true, byteLength };
      }
      const bytes = await this.runtime.readFile(path);
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return {
        blob: new Blob([buffer], { type: 'video/mp4' }),
        streamed: false,
        byteLength: bytes.byteLength,
      };
    } finally {
      await this.runtime.removeFile(path).catch(() => undefined);
    }
  }

  private async pipeToStream(
    path: string,
    writable: WritableStream<VideoSinkChunk>,
  ): Promise<void> {
    const bytes = await this.runtime.readFile(path);
    const writer = writable.getWriter();
    try {
      const CHUNK = 1 << 20; // 1 MiB
      let position = 0;
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK) {
        const data = bytes.subarray(offset, Math.min(offset + CHUNK, bytes.byteLength));
        await writer.write({ type: 'write', data, position });
        position += data.byteLength;
      }
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => undefined);
      throw error;
    } finally {
      writer.releaseLock();
    }
  }

  async cancel(): Promise<void> {
    if (this.canceled || this.finalized) return;
    this.canceled = true;
    await this.runtime.invoke(VT_COMMANDS.cancel, { sessionId: this.sessionId }).catch(
      () => undefined,
    );
  }
}

/** Map the native probe to the shared capability shape. */
function toCapabilities(
  probe: VideoCapabilityProbe,
  native: VtProbeResult,
): VideoCapabilities {
  if (!native.available) return unavailableCapabilities(probe, 'codec-unsupported');
  const codec = (supported: boolean) => ({
    supported,
    powerEfficient: supported ? native.powerEfficient : undefined,
    reason: supported ? undefined : ('codec-unsupported' as const),
  });
  return {
    codecs: { h264: codec(native.h264), h265: codec(native.h265) },
    // Native always streams to a temp file, so a streaming destination exists.
    streamingSupported: true,
    maxTestedWidth: probe.width,
    maxTestedHeight: probe.height,
    maxTestedFps: probe.fps,
  };
}

/** Build a native VideoToolbox adapter. `getRuntime` is injectable for tests. */
export function createTauriVideoToolboxAdapter(
  getRuntime: () => Promise<TauriVideoRuntime> = defaultRuntime,
): VideoExportAdapter {
  return {
    async capabilities(probe): Promise<VideoCapabilities> {
      let runtime: TauriVideoRuntime;
      try {
        runtime = await getRuntime();
      } catch {
        return unavailableCapabilities(probe);
      }
      if (!runtime.isTauri) return unavailableCapabilities(probe);
      try {
        const native = await runtime.invoke<VtProbeResult>(VT_COMMANDS.probe, {
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
        });
        return toCapabilities(probe, native);
      } catch {
        return unavailableCapabilities(probe, 'probe-failed');
      }
    },

    async begin(config: VideoExportBeginConfig): Promise<VideoExportSession> {
      const runtime = await getRuntime();
      const sessionId = nextSessionId();
      await runtime.invoke(VT_COMMANDS.begin, {
        sessionId,
        codec: config.codec satisfies VideoCodecId,
        width: config.width,
        height: config.height,
        fps: config.fps,
        bitrate: config.bitrate ?? null,
      });
      return new VideoToolboxSession(runtime, sessionId, config);
    },
  };
}

/** Singleton wired to the real Tauri runtime. */
export const tauriVideoToolboxAdapter: VideoExportAdapter =
  createTauriVideoToolboxAdapter();
