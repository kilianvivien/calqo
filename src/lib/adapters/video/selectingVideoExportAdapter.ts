import type {
  VideoCapabilities,
  VideoCapabilityProbe,
  VideoCodecId,
  VideoEncoderPreference,
  VideoExportAdapter,
  VideoExportBeginConfig,
  VideoExportSession,
} from './VideoExportAdapter';

/**
 * Routes each export to the best available backend: the native VideoToolbox
 * adapter (M-series hardware encoder) when it reports a codec supported,
 * otherwise the WebCodecs adapter (plan §7). `capabilities()` probes both and
 * records, per codec, which backend to use; `begin()` follows that decision and
 * falls back to WebCodecs if the native session cannot start. The merged
 * capabilities the UI sees advertise the strongest backend per codec, so an
 * export never silently downgrades from hardware to software without a reason.
 *
 * The user's `VideoEncoderPreference` biases that routing (Settings → Video
 * export). It can force WebCodecs outright, or ask for native, but it can never
 * make an export fail: an unavailable preferred backend still falls back.
 */

type Backend = 'native' | 'webcodecs';

const CODECS: VideoCodecId[] = ['h264', 'h265'];

function mergeCapabilities(
  probe: VideoCapabilityProbe,
  native: VideoCapabilities,
  webcodecs: VideoCapabilities,
  preference: VideoEncoderPreference,
): { capabilities: VideoCapabilities; routes: Record<VideoCodecId, Backend> } {
  const routes = {} as Record<VideoCodecId, Backend>;
  const codecs = {} as VideoCapabilities['codecs'];
  for (const codec of CODECS) {
    // `webcodecs` forces the WebView encoder. `auto` and `native` both prefer
    // native where it works; they differ only in `begin()`, where `native`
    // retries a native session even for a codec the probe reported unsupported.
    const useNative =
      preference !== 'webcodecs' && native.codecs[codec].supported;
    if (useNative) {
      routes[codec] = 'native';
      codecs[codec] = native.codecs[codec];
    } else {
      routes[codec] = 'webcodecs';
      // Surface the WebCodecs capability; if neither supports it the reason is
      // WebCodecs' (the fallback the user would actually hit).
      codecs[codec] = webcodecs.codecs[codec];
    }
  }
  return {
    capabilities: {
      codecs,
      streamingSupported:
        native.streamingSupported || webcodecs.streamingSupported,
      maxTestedWidth: probe.width,
      maxTestedHeight: probe.height,
      maxTestedFps: probe.fps,
    },
    routes,
  };
}

export function createSelectingVideoExportAdapter(
  native: VideoExportAdapter,
  webcodecs: VideoExportAdapter,
  /** Read fresh on every call so changing the setting takes effect immediately,
   * without rebuilding the adapter singleton. */
  getPreference: () => VideoEncoderPreference = () => 'auto',
): VideoExportAdapter {
  let routes: Record<VideoCodecId, Backend> | null = null;

  return {
    async capabilities(probe): Promise<VideoCapabilities> {
      const preference = getPreference();
      const [nativeCaps, webCaps] = await Promise.all([
        native.capabilities(probe),
        webcodecs.capabilities(probe),
      ]);
      const merged = mergeCapabilities(probe, nativeCaps, webCaps, preference);
      routes = merged.routes;
      return merged.capabilities;
    },

    async begin(config: VideoExportBeginConfig): Promise<VideoExportSession> {
      const preference = getPreference();
      if (preference === 'webcodecs') return webcodecs.begin(config);
      // `native` tries the native encoder even when the probe reported this
      // codec unsupported — the probe is advisory and the fallback below keeps
      // the attempt free.
      const tryNative =
        preference === 'native' || (routes?.[config.codec] ?? 'webcodecs') === 'native';
      if (tryNative) {
        try {
          return await native.begin(config);
        } catch {
          // Native session failed to start (feature unbuilt, runtime error) —
          // fall back rather than fail the export.
          return webcodecs.begin(config);
        }
      }
      return webcodecs.begin(config);
    },
  };
}
