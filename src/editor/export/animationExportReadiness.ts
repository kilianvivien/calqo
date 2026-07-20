import type { CalqoArtboard } from '@/lib/schema';
import { flattenLayers } from '@/editor/utils/layers';
import type {
  VideoCapabilities,
  VideoCodecId,
} from '@/lib/adapters/video/VideoExportAdapter';

/**
 * Structured animation-export warnings (plan §6.3 / AN-2.1). The exporter and
 * adapter return **codes + params only**; the UI localizes them (EN + FR
 * catalogs under `export.animWarnings.*`). This mirrors the HTML export's
 * structured-warning model rather than the readiness path's raw strings.
 */

export type AnimExportWarningCode =
  | 'unsupportedCodec'
  | 'softwareEncoding'
  | 'oddDimensionAdjusted'
  | 'gifCaps'
  | 'unsupportedEffect'
  | 'missingAsset'
  | 'memoryFallback'
  | 'cancellation'
  | 'partialOutputCleanup';

export interface AnimExportWarning {
  code: AnimExportWarningCode;
  /** Interpolation params for the localized message (dimensions, names, …). */
  params?: Record<string, string | number>;
}

export function animWarningIdentity(warning: AnimExportWarning): string {
  return `${warning.code}:${JSON.stringify(warning.params ?? {})}`;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/** True when any layer in the artboard carries an animation block — the gate for
 * offering MP4/GIF for this artboard. */
export function isArtboardAnimatable(artboard: CalqoArtboard): boolean {
  return flattenLayers(artboard.layers).some((l) => l.animation !== undefined);
}

// ---------------------------------------------------------------------------
// GIF caps (plan §6.3 / AN-0.5.5)
// ---------------------------------------------------------------------------

export const GIF_CAPS = {
  maxDurationMs: 15_000,
  maxLongEdge: 720,
  maxFps: 15,
} as const;

export interface GifOutputPlan {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  /** Frame delay (ms) written into each GIF frame. */
  frameDelayMs: number;
  frameCount: number;
  /** Set when a cap changed the source request (surfaced as a `gifCaps` note). */
  adjusted: boolean;
}

/** Clamp a requested GIF export to the hard caps, preserving aspect ratio, and
 * report whether anything was reduced. */
export function planGifOutput(
  srcWidth: number,
  srcHeight: number,
  srcFps: number,
  srcDurationMs: number,
): GifOutputPlan {
  const fps = Math.max(1, Math.min(srcFps, GIF_CAPS.maxFps));
  const durationMs = Math.min(srcDurationMs, GIF_CAPS.maxDurationMs);
  const longEdge = Math.max(srcWidth, srcHeight);
  const scale = longEdge > GIF_CAPS.maxLongEdge ? GIF_CAPS.maxLongEdge / longEdge : 1;
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));
  const frameDelayMs = Math.round(1000 / fps);
  const frameCount = Math.max(1, Math.round((durationMs / 1000) * fps));
  const adjusted =
    fps !== srcFps || durationMs !== srcDurationMs || scale !== 1;
  return { width, height, fps, durationMs, frameDelayMs, frameCount, adjusted };
}

// ---------------------------------------------------------------------------
// Capability → warnings
// ---------------------------------------------------------------------------

/** Whether the requested MP4 codec is usable given probed capabilities. */
export function isCodecUsable(
  capabilities: VideoCapabilities,
  codec: VideoCodecId,
): boolean {
  return capabilities.codecs[codec]?.supported === true;
}

/** Even output dimensions (H.264 requires even width/height) plus a note when a
 * dimension had to grow. */
export function evenDimensions(width: number, height: number): {
  width: number;
  height: number;
  adjusted: boolean;
} {
  const even = (v: number) => (v % 2 === 0 ? v : v + 1);
  const w = even(width);
  const h = even(height);
  return { width: w, height: h, adjusted: w !== width || h !== height };
}

/** Pre-export warnings derived from the requested MP4 config and capabilities:
 * codec fallback, software (non-power-efficient) encoding, and dimension
 * padding. Missing-asset / effect / memory / cancellation warnings are emitted
 * by the frame loop and adapter at run time. */
export function mp4ConfigWarnings(
  capabilities: VideoCapabilities,
  codec: VideoCodecId,
  srcWidth: number,
  srcHeight: number,
): AnimExportWarning[] {
  const warnings: AnimExportWarning[] = [];
  const cap = capabilities.codecs[codec];
  if (!cap?.supported) {
    warnings.push({ code: 'unsupportedCodec', params: { codec } });
  } else if (cap.powerEfficient === false) {
    warnings.push({ code: 'softwareEncoding', params: { codec } });
  }
  const { width, height, adjusted } = evenDimensions(srcWidth, srcHeight);
  if (adjusted) {
    warnings.push({ code: 'oddDimensionAdjusted', params: { width, height } });
  }
  return warnings;
}
