import { GIFEncoder, applyPalette, quantize } from 'gifenc';

/**
 * GIF encoder core (plan §6.3 / AN-0.5.5, AN-2.4). Pure and DOM-free so it runs
 * identically inline (tests, no-Worker runtimes) and inside the dedicated GIF
 * worker. Per-frame palettes with no dithering (gifenc's documented limitation)
 * — good for flat vector/brand art, disclosed as a v1 limitation for photos.
 */

export interface GifStreamOptions {
  width: number;
  height: number;
  /** Per-frame delay in ms (from the capped fps). */
  frameDelayMs: number;
  /** Loop forever by default (0). */
  repeat?: number;
}

export interface GifStream {
  /** Add one RGBA frame (length must be width*height*4). */
  addFrame(rgba: Uint8ClampedArray | Uint8Array): void;
  /** Finish the stream and return the GIF bytes. */
  finish(): Uint8Array;
}

/** Create an incremental GIF stream. Each frame is quantized to its own ≤256
 * colour palette then LZW-encoded. */
export function createGifStream(options: GifStreamOptions): GifStream {
  const { width, height, frameDelayMs, repeat = 0 } = options;
  const gif = GIFEncoder();
  let first = true;
  return {
    addFrame(rgba) {
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);
      gif.writeFrame(index, width, height, {
        palette,
        delay: frameDelayMs,
        // The loop count is written on the first frame's graphic-control block.
        repeat: first ? repeat : undefined,
        first,
      });
      first = false;
    },
    finish() {
      gif.finish();
      return gif.bytes();
    },
  };
}

/** One-shot helper: encode a full array of RGBA frames to GIF bytes. */
export function encodeGif(
  frames: (Uint8ClampedArray | Uint8Array)[],
  options: GifStreamOptions,
): Uint8Array {
  const stream = createGifStream(options);
  for (const frame of frames) stream.addFrame(frame);
  return stream.finish();
}
