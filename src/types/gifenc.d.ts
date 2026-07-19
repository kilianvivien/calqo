/**
 * Minimal ambient types for `gifenc` (ships no `.d.ts`). Covers only the surface
 * the GIF export path uses (plan §6.3 / AN-2.4). Palette is an array of RGB(A)
 * tuples; index data is the paletted bitmap.
 */
declare module 'gifenc' {
  export type Palette = number[][];

  export interface WriteFrameOptions {
    palette?: Palette;
    /** Frame delay in milliseconds. */
    delay?: number;
    /** Palette index treated as transparent, or a boolean to auto-detect. */
    transparent?: boolean | number;
    transparentIndex?: number;
    /** Loop count; 0 = loop forever. */
    repeat?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array | Uint8ClampedArray,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export interface GifEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export function GIFEncoder(options?: GifEncoderOptions): GifEncoderInstance;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: 'rgb565' | 'rgb444' | 'rgba4444';
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaColor?: number;
      clearAlphaThreshold?: number;
    },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array;
}
