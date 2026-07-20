import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  canEncodeVideo,
  type VideoCodec,
  type VideoEncodingConfig,
} from 'mediabunny';
import type {
  CodecCapability,
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
 * WebCodecs + Mediabunny video export adapter (plan §6.3 / §7, AN-2.2). Browser
 * and Tauri-WKWebView share this path (both sit WebCodecs on the platform
 * encoder — VideoToolbox on macOS). H.264/`avc` is the default; H.265/`hevc` is
 * probed but hidden from the v1 UI. Every capability answer is measured, never
 * assumed hardware-accelerated (§7).
 */

const CODEC: Record<VideoCodecId, VideoCodec> = { h264: 'avc', h265: 'hevc' };

/** ~2 s GOP (plan §6.3) — frequent enough for scrub/seek, small enough files. */
const KEY_FRAME_INTERVAL_S = 2;

/** Bitrate policy (bits/s). H.265 targets lower than H.264 for the same source
 * so "smaller file" is real, not a re-encode at the same size (§6.3). */
export function defaultBitrate(
  codec: VideoCodecId,
  width: number,
  height: number,
): number {
  const megapixels = (width * height) / 1_000_000;
  const perMp = codec === 'h265' ? 3_500_000 : 6_000_000;
  return Math.max(1_000_000, Math.round(megapixels * perMp));
}

function encodingConfig(config: VideoExportBeginConfig): VideoEncodingConfig {
  return {
    codec: CODEC[config.codec],
    bitrate: config.bitrate ?? defaultBitrate(config.codec, config.width, config.height),
    keyFrameInterval: KEY_FRAME_INTERVAL_S,
    // Deny size drift: all frames must share the first frame's exact dimensions.
    sizeChangeBehavior: 'deny',
    latencyMode: 'quality',
  };
}

async function probeCodec(
  codec: VideoCodecId,
  probe: VideoCapabilityProbe,
): Promise<CodecCapability> {
  try {
    const supported = await canEncodeVideo(CODEC[codec], {
      width: probe.width,
      height: probe.height,
      bitrate: defaultBitrate(codec, probe.width, probe.height),
    });
    if (!supported) return { supported: false, reason: 'codec-unsupported' };
    return { supported: true, powerEfficient: await powerEfficient(codec, probe) };
  } catch {
    return { supported: false, reason: 'probe-failed' };
  }
}

interface MediaCapabilitiesInfoLike {
  powerEfficient?: boolean;
}
interface MediaCapabilitiesLike {
  encodingInfo?: (config: unknown) => Promise<MediaCapabilitiesInfoLike>;
}

/** `mediaCapabilities.encodingInfo().powerEfficient` — the closest signal to
 * hardware acceleration. Advisory: `undefined` when unknown (§7). */
async function powerEfficient(
  codec: VideoCodecId,
  probe: VideoCapabilityProbe,
): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined') return undefined;
  const mc = (navigator as Navigator & { mediaCapabilities?: MediaCapabilitiesLike })
    .mediaCapabilities;
  if (!mc?.encodingInfo) return undefined;
  try {
    const info = await mc.encodingInfo({
      type: 'record',
      video: {
        contentType: `video/mp4; codecs="${codec === 'h265' ? 'hvc1' : 'avc1'}"`,
        width: probe.width,
        height: probe.height,
        bitrate: defaultBitrate(codec, probe.width, probe.height),
        framerate: probe.fps,
      },
    });
    return info.powerEfficient;
  } catch {
    return undefined;
  }
}

/** File System Access / Tauri streamed output is available when the runtime can
 * mint a writable file stream. Probed indirectly here; the export flow supplies
 * the concrete writable. */
function streamingSupported(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { WritableStream?: unknown }).WritableStream === 'function'
  );
}

class WebCodecsSession implements VideoExportSession {
  private canceled = false;
  private finalized = false;

  constructor(
    private readonly output: Output,
    private readonly source: CanvasSource,
    private readonly result: () => VideoExportResult,
    private readonly signal?: AbortSignal,
  ) {}

  async addFrame(timestampMicros: number, durationMicros: number): Promise<void> {
    if (this.canceled) return;
    if (this.signal?.aborted) {
      await this.cancel();
      throw new DOMException('Export aborted', 'AbortError');
    }
    // CanvasSource captures the canvas's current pixels, encodes, and resolves
    // once the encoder is ready for more — i.e. it applies backpressure.
    await this.source.add(timestampMicros / 1_000_000, durationMicros / 1_000_000);
  }

  async finalize(): Promise<VideoExportResult> {
    if (this.canceled) throw new DOMException('Export aborted', 'AbortError');
    // Flush the source's encoder, then close the mux.
    await this.output.finalize();
    this.finalized = true;
    return this.result();
  }

  async cancel(): Promise<void> {
    if (this.canceled || this.finalized) return;
    this.canceled = true;
    try {
      await this.output.cancel();
    } catch {
      /* already torn down */
    }
  }
}

export const webCodecsVideoExportAdapter: VideoExportAdapter = {
  async capabilities(probe): Promise<VideoCapabilities> {
    if (typeof canEncodeVideo !== 'function') {
      return unavailableCapabilities(probe);
    }
    try {
      const [h264, h265] = await Promise.all([
        probeCodec('h264', probe),
        probeCodec('h265', probe),
      ]);
      return {
        codecs: { h264, h265 },
        streamingSupported: streamingSupported(),
        maxTestedWidth: probe.width,
        maxTestedHeight: probe.height,
        maxTestedFps: probe.fps,
      };
    } catch {
      return unavailableCapabilities(probe, 'probe-failed');
    }
  },

  async begin(config): Promise<VideoExportSession> {
    const streaming = config.sink.kind === 'stream';
    const target =
      config.sink.kind === 'stream'
        ? new StreamTarget(
            config.sink.writable as unknown as WritableStream<VideoSinkChunk>,
            { chunked: true },
          )
        : new BufferTarget();

    const output = new Output({
      // Fragmented fMP4 streams to disk with bounded memory; in-memory fast-start
      // gives the compact, widely-compatible file for the download fallback.
      format: new Mp4OutputFormat({ fastStart: streaming ? 'fragmented' : 'in-memory' }),
      target,
    });

    const source = new CanvasSource(config.canvas, encodingConfig(config));
    output.addVideoTrack(source, { frameRate: config.fps });
    await output.start();

    const result = (): VideoExportResult => {
      if (target instanceof BufferTarget && target.buffer) {
        return {
          blob: new Blob([target.buffer], { type: 'video/mp4' }),
          streamed: false,
          byteLength: target.buffer.byteLength,
        };
      }
      return { streamed: true, byteLength: 0 };
    };

    return new WebCodecsSession(output, source, result, config.signal);
  },
};
