import type {
  VideoCapabilities,
  VideoCapabilityProbe,
  VideoCodecId,
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
 */

type Backend = 'native' | 'webcodecs';

const CODECS: VideoCodecId[] = ['h264', 'h265'];

function mergeCapabilities(
  probe: VideoCapabilityProbe,
  native: VideoCapabilities,
  webcodecs: VideoCapabilities,
): { capabilities: VideoCapabilities; routes: Record<VideoCodecId, Backend> } {
  const routes = {} as Record<VideoCodecId, Backend>;
  const codecs = {} as VideoCapabilities['codecs'];
  for (const codec of CODECS) {
    if (native.codecs[codec].supported) {
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
): VideoExportAdapter {
  let routes: Record<VideoCodecId, Backend> | null = null;

  return {
    async capabilities(probe): Promise<VideoCapabilities> {
      const [nativeCaps, webCaps] = await Promise.all([
        native.capabilities(probe),
        webcodecs.capabilities(probe),
      ]);
      const merged = mergeCapabilities(probe, nativeCaps, webCaps);
      routes = merged.routes;
      return merged.capabilities;
    },

    async begin(config: VideoExportBeginConfig): Promise<VideoExportSession> {
      const chosen = routes?.[config.codec] ?? 'webcodecs';
      if (chosen === 'native') {
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
