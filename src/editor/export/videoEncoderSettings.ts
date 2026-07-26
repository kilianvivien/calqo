import { appSettings } from '@/lib/adapters';
import {
  DEFAULT_VIDEO_ENCODER_PREFERENCE,
  type VideoEncoderPreference,
} from '@/lib/adapters/video/VideoExportAdapter';
import { setVideoEncoderPreference } from '@/lib/adapters/video/encoderPreference';
import { useUiStore } from '@/lib/state/uiStore';

export const VIDEO_ENCODER_SETTINGS_KEY = 'videoExport.encoderPreference';

const VALID: readonly VideoEncoderPreference[] = ['auto', 'native', 'webcodecs'];

/** Coerce anything persisted (or hand-edited) back to a known preference. */
export function normalizeVideoEncoderPreference(
  value: unknown,
): VideoEncoderPreference {
  return VALID.includes(value as VideoEncoderPreference)
    ? (value as VideoEncoderPreference)
    : DEFAULT_VIDEO_ENCODER_PREFERENCE;
}

export async function loadVideoEncoderPreference(): Promise<VideoEncoderPreference> {
  const saved = await appSettings.get<VideoEncoderPreference>(VIDEO_ENCODER_SETTINGS_KEY);
  const preference = normalizeVideoEncoderPreference(saved);
  useUiStore.setState({ videoEncoderPreference: preference });
  setVideoEncoderPreference(preference);
  return preference;
}

export async function saveVideoEncoderPreference(
  value: VideoEncoderPreference,
): Promise<VideoEncoderPreference> {
  const preference = normalizeVideoEncoderPreference(value);
  await appSettings.set(VIDEO_ENCODER_SETTINGS_KEY, preference);
  useUiStore.setState({ videoEncoderPreference: preference });
  setVideoEncoderPreference(preference);
  return preference;
}
