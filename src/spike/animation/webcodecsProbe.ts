/**
 * AN-0.5.4 capability probe. Dependency-free: it only calls platform APIs
 * (`VideoEncoder.isConfigSupported` and `navigator.mediaCapabilities.encodingInfo`)
 * and records their answers separately, because — per §7 — no single signal
 * proves hardware encoding. Safe to import in Node/jsdom: every entry point
 * feature-detects and degrades to an "unsupported / unavailable" result.
 */

export type CodecFamily = 'h264' | 'h265';

export interface VideoEncoderConfigLike {
  codec: string;
  width: number;
  height: number;
  bitrate?: number;
  framerate?: number;
}

export interface CodecProbeResult {
  family: CodecFamily;
  config: VideoEncoderConfigLike;
  /** `VideoEncoder.isConfigSupported` — configurability only. */
  configSupported: boolean;
  /** `mediaCapabilities.encodingInfo` — the closest signal to HW acceleration. */
  powerEfficient?: boolean;
  smooth?: boolean;
  /** Reason when unsupported/unavailable, for the warnings catalog. */
  reason?: string;
}

// --- Minimal shapes for the platform APIs (not in this project's TS lib). -----

interface VideoEncoderSupportLike {
  supported?: boolean;
  config?: VideoEncoderConfigLike;
}
interface VideoEncoderCtorLike {
  isConfigSupported?: (config: VideoEncoderConfigLike) => Promise<VideoEncoderSupportLike>;
}
interface MediaCapabilitiesInfoLike {
  supported?: boolean;
  smooth?: boolean;
  powerEfficient?: boolean;
}
interface MediaCapabilitiesLike {
  encodingInfo?: (config: unknown) => Promise<MediaCapabilitiesInfoLike>;
}

function getVideoEncoder(): VideoEncoderCtorLike | undefined {
  const g = globalThis as { VideoEncoder?: VideoEncoderCtorLike };
  return g.VideoEncoder;
}

function getMediaCapabilities(): MediaCapabilitiesLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { mediaCapabilities?: MediaCapabilitiesLike })
    .mediaCapabilities;
}

export function isWebCodecsAvailable(): boolean {
  return typeof getVideoEncoder()?.isConfigSupported === 'function';
}

/** Default codec strings for 1080p targets. Spike values — revisit per §7. */
export const CODEC_STRINGS: Record<CodecFamily, string> = {
  // H.264 High profile, level 4.2 (covers 1080p up to 60fps).
  h264: 'avc1.640029',
  // HEVC Main profile, level 4.1.
  h265: 'hvc1.1.6.L123.B0',
};

/** Bitrate policy (bits/s): H.265 targets lower than H.264 for the same source,
 * so "smaller file" is real and not just re-encoding at the same size (§6.3). */
export function defaultBitrate(family: CodecFamily, width: number, height: number): number {
  const megapixels = (width * height) / 1_000_000;
  const perMp = family === 'h265' ? 3_500_000 : 6_000_000;
  return Math.round(megapixels * perMp);
}

export function buildEncoderConfig(
  family: CodecFamily,
  width: number,
  height: number,
  fps: number,
): VideoEncoderConfigLike {
  return {
    codec: CODEC_STRINGS[family],
    width,
    height,
    framerate: fps,
    bitrate: defaultBitrate(family, width, height),
  };
}

async function probeOne(
  family: CodecFamily,
  config: VideoEncoderConfigLike,
): Promise<CodecProbeResult> {
  const encoder = getVideoEncoder();
  if (!encoder?.isConfigSupported) {
    return { family, config, configSupported: false, reason: 'webcodecs-unavailable' };
  }

  let configSupported = false;
  try {
    const support = await encoder.isConfigSupported(config);
    configSupported = support.supported === true;
  } catch (err) {
    return {
      family,
      config,
      configSupported: false,
      reason: err instanceof Error ? err.message : 'isConfigSupported-threw',
    };
  }

  const result: CodecProbeResult = { family, config, configSupported };
  if (!configSupported) result.reason = 'config-unsupported';

  const mc = getMediaCapabilities();
  if (mc?.encodingInfo) {
    try {
      const info = await mc.encodingInfo({
        type: 'record',
        video: {
          contentType: `video/mp4; codecs="${config.codec}"`,
          width: config.width,
          height: config.height,
          bitrate: config.bitrate ?? defaultBitrate(family, config.width, config.height),
          framerate: config.framerate ?? 30,
        },
      });
      result.smooth = info.smooth;
      result.powerEfficient = info.powerEfficient;
    } catch {
      // encodingInfo is advisory; leave power-efficiency unknown.
    }
  }
  return result;
}

/** Probe a batch of encoder configs. H.264 first (the default), H.265 optional. */
export async function probeVideoCodecs(
  configs: Array<{ family: CodecFamily; config: VideoEncoderConfigLike }>,
): Promise<CodecProbeResult[]> {
  const results: CodecProbeResult[] = [];
  for (const { family, config } of configs) {
    results.push(await probeOne(family, config));
  }
  return results;
}
