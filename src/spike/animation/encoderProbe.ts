import { NotImplementedError, type FrameSource } from '@/editor/rendering/offscreenScene';
import type { CodecId } from './measurement';

/**
 * AN-0.5.4 / AN-0.5.5 encoder seams. These define the frame-encoder contract the
 * export pipeline will use (§6.3) without pulling a muxer (Mediabunny) or GIF
 * encoder (gifenc) into the dependency graph — those are added only after the
 * spike measures and records the decision (§12.3). The stubs throw
 * {@link NotImplementedError} so the harness records a `skipped` measurement.
 */

export interface EncoderConfig {
  codec: CodecId;
  width: number;
  height: number;
  fps: number;
  bitrateKbps?: number;
}

export interface EncodedOutput {
  bytes: Uint8Array;
  container: 'mp4' | 'gif';
}

export interface FrameEncoderProbe {
  begin(config: EncoderConfig): Promise<void>;
  /** Enqueue one frame at an explicit microsecond timestamp (§6.3). Implementations
   * apply backpressure via the returned promise and close any `VideoFrame`. */
  addFrame(source: FrameSource, timestampUs: number): Promise<void>;
  /** Flush, mux, and return the finished file bytes. */
  finalize(): Promise<EncodedOutput>;
  /** Idempotent: discard partial output, close the encoder, free buffers. */
  cancel(): Promise<void>;
}

/** WebCodecs + muxer MP4 encoder — implemented in AN-2 once AN-0.5 picks the
 * muxer. Until then it is a measured-as-unavailable seam. */
export function createMp4EncoderProbe(): FrameEncoderProbe {
  const unimplemented = () => {
    throw new NotImplementedError(
      'AN-0.5.4 mp4 encoder',
      'WebCodecs/Mediabunny MP4 encoder not wired yet (AN-0.5.4). Add the muxer only after the spike gate.',
    );
  };
  return {
    begin: async () => unimplemented(),
    addFrame: async () => unimplemented(),
    finalize: async () => unimplemented(),
    cancel: async () => {
      /* nothing allocated yet */
    },
  };
}

/** GIF worker encoder — implemented in AN-2 once AN-0.5 picks the encoder. */
export function createGifEncoderProbe(): FrameEncoderProbe {
  const unimplemented = () => {
    throw new NotImplementedError(
      'AN-0.5.5 gif encoder',
      'GIF encoder not selected yet (AN-0.5.5). Compare gifenc vs alternatives on the fixture set first.',
    );
  };
  return {
    begin: async () => unimplemented(),
    addFrame: async () => unimplemented(),
    finalize: async () => unimplemented(),
    cancel: async () => {
      /* nothing allocated yet */
    },
  };
}

/** Pick the seam for a codec id. */
export function createEncoderProbe(codec: CodecId): FrameEncoderProbe {
  return codec === 'gif' ? createGifEncoderProbe() : createMp4EncoderProbe();
}
