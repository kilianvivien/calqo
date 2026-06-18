/** Social-media artboard presets (PRD §5.4 / plan §11.1). */

export interface ArtboardPreset {
  id: string;
  /** i18n-independent default name; UI may localize the label. */
  name: string;
  width: number;
  height: number;
}

export const ARTBOARD_PRESETS = {
  'ig-square': { id: 'ig-square', name: 'Instagram square', width: 1080, height: 1080 },
  'ig-portrait': { id: 'ig-portrait', name: 'Instagram portrait', width: 1080, height: 1350 },
  story: { id: 'story', name: 'Story / Reel cover', width: 1080, height: 1920 },
  'x-post': { id: 'x-post', name: 'X / Twitter post', width: 1600, height: 900 },
  'linkedin-post': { id: 'linkedin-post', name: 'LinkedIn post', width: 1200, height: 627 },
  'facebook-link': { id: 'facebook-link', name: 'Facebook link', width: 1200, height: 630 },
  'youtube-thumbnail': { id: 'youtube-thumbnail', name: 'YouTube thumbnail', width: 1280, height: 720 },
  'pinterest-pin': { id: 'pinterest-pin', name: 'Pinterest pin', width: 1000, height: 1500 },
} as const satisfies Record<string, ArtboardPreset>;

export type ArtboardPresetId = keyof typeof ARTBOARD_PRESETS;

export const ARTBOARD_PRESET_LIST: ArtboardPreset[] = Object.values(ARTBOARD_PRESETS);

export const DEFAULT_PRESET_ID: ArtboardPresetId = 'ig-square';

export function getPreset(id: ArtboardPresetId): ArtboardPreset {
  return ARTBOARD_PRESETS[id];
}
