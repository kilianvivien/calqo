import type { FrameSource } from '@/editor/rendering/offscreenScene';

/**
 * Video export adapter contract (plan §7 / AN-2.1). Deliberately higher-level
 * than a raw encoder wrapper: rendering hand-off, backpressure, muxing,
 * cancellation, and streamed output all cross this boundary together. The
 * browser + Tauri-WKWebView share the WebCodecs/Mediabunny implementation; a
 * native VideoToolbox path could later slot behind the same interface.
 *
 * The frame orchestrator (`animatedFrameExport.ts`) owns the render loop; it
 * draws into the scene's canvas, then asks the session to capture + encode that
 * canvas at an explicit timestamp. Nothing here knows about Konva or presets.
 */

/** v1 codecs. H.264 is the default social deliverable; H.265 is deferred (§2). */
export type VideoCodecId = 'h264' | 'h265';

/** Stable reason codes for an unavailable/limited capability. Localized at the
 * UI boundary — the adapter never returns display strings (§6.3). */
export type VideoCapabilityReason =
  | 'webcodecs-unavailable'
  | 'codec-unsupported'
  | 'config-unsupported'
  | 'probe-failed';

export interface CodecCapability {
  supported: boolean;
  /** `mediaCapabilities.encodingInfo().powerEfficient` — the closest signal to
   * hardware acceleration. `undefined` when unknown; never assume `true`. */
  powerEfficient?: boolean;
  reason?: VideoCapabilityReason;
}

export interface VideoCapabilities {
  /** Per-codec configurability at the probed target. */
  codecs: Record<VideoCodecId, CodecCapability>;
  /** Whether a streaming sink (File System Access / Tauri) is usable here. */
  streamingSupported: boolean;
  /** The size/fps the probe actually tested, so the UI can be honest. */
  maxTestedWidth: number;
  maxTestedHeight: number;
  maxTestedFps: number;
}

export interface VideoCapabilityProbe {
  width: number;
  height: number;
  fps: number;
}

/** Where the muxed bytes go. `buffer` accumulates to a single Blob (browser
 * download fallback); `stream` writes chunks to a WritableStream (File System
 * Access / Tauri) so a 60 s clip never sits whole in memory (§6.3). */
export type VideoSink =
  | { kind: 'buffer' }
  | { kind: 'stream'; writable: WritableStream<VideoSinkChunk> };

/** Chunk shape written to a streaming sink. Chosen to match **both** Mediabunny's
 * `StreamTarget` and the File System Access `FileSystemWritableFileStream`, so a
 * `showSaveFilePicker()` writable can be passed straight through. */
export interface VideoSinkChunk {
  type: 'write';
  data: Uint8Array;
  position: number;
}

export interface VideoExportBeginConfig {
  codec: VideoCodecId;
  /** Even output dimensions (H.264 requires even width/height). */
  width: number;
  height: number;
  fps: number;
  /** Target bitrate in bits/sec. Omit to let the adapter pick from its policy. */
  bitrate?: number;
  /** The scene surface every frame is captured from (a stable canvas ref). */
  canvas: FrameSource;
  sink: VideoSink;
  /** Cancels the whole session (render + encode + mux + sink). */
  signal?: AbortSignal;
}

export interface VideoExportResult {
  /** Present only for a `buffer` sink; a `stream` sink returns bytes via the
   * WritableStream and leaves this undefined. */
  blob?: Blob;
  streamed: boolean;
  byteLength: number;
}

export interface VideoExportSession {
  /**
   * Capture the session canvas's current pixels as one frame at the given
   * timestamp/duration (microseconds). Returns once the encoder is ready for
   * more frames, so callers await it for backpressure. Must close any decoded
   * frame it allocates.
   */
  addFrame(timestampMicros: number, durationMicros: number): Promise<void>;
  /** Flush the encoder, finish the mux, and resolve the output. */
  finalize(): Promise<VideoExportResult>;
  /** Idempotent: discard partial output, close the encoder, free buffers. Safe
   * to call before the first frame, mid-encode, during finalize, or twice. */
  cancel(): Promise<void>;
}

export interface VideoExportAdapter {
  /** Lazily probe codec/streaming support for a target. Cache per runtime
   * session only — capabilities move with the OS/WebView. */
  capabilities(probe: VideoCapabilityProbe): Promise<VideoCapabilities>;
  /** Begin an encode session for the given config. Throws if the codec is
   * unavailable — callers should consult {@link capabilities} first. */
  begin(config: VideoExportBeginConfig): Promise<VideoExportSession>;
}

/** A capabilities result with every codec unavailable, for runtimes without
 * WebCodecs (Node/jsdom, old WebViews). */
export function unavailableCapabilities(
  probe: VideoCapabilityProbe,
  reason: VideoCapabilityReason = 'webcodecs-unavailable',
): VideoCapabilities {
  return {
    codecs: {
      h264: { supported: false, reason },
      h265: { supported: false, reason },
    },
    streamingSupported: false,
    maxTestedWidth: probe.width,
    maxTestedHeight: probe.height,
    maxTestedFps: probe.fps,
  };
}
