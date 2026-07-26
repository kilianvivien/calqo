import {
  DEFAULT_VIDEO_ENCODER_PREFERENCE,
  type VideoEncoderPreference,
} from './VideoExportAdapter';

/**
 * The active encoder preference, pushed down from the settings layer.
 *
 * The adapter must not reach up into the UI store (adapters are the lower
 * layer), and the preference has to be readable synchronously at export time,
 * so it lives here and `editor/export/videoEncoderSettings.ts` keeps it in sync
 * with the persisted setting.
 */
let current: VideoEncoderPreference = DEFAULT_VIDEO_ENCODER_PREFERENCE;

export function getVideoEncoderPreference(): VideoEncoderPreference {
  return current;
}

export function setVideoEncoderPreference(value: VideoEncoderPreference): void {
  current = value;
}
