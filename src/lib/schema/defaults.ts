import { createId } from '@/lib/utils/ids';
import {
  CURRENT_SCHEMA_VERSION,
  type CalqoArtboard,
  type CalqoProject,
  type LocaleCode,
} from './schema';
import {
  ARTBOARD_PRESETS,
  DEFAULT_PRESET_ID,
  getPreset,
  type ArtboardPresetId,
} from './presets';

/** Default brand palette for fresh projects (PRD §7.2 sketch). */
const DEFAULT_PALETTE = ['#0A2540', '#FFFFFF', '#E8B339'];
const DEFAULT_LOCALE: LocaleCode = 'en';

export function createArtboard(
  preset: ArtboardPresetId = DEFAULT_PRESET_ID,
  name?: string,
): CalqoArtboard {
  const p = getPreset(preset);
  return {
    id: createId('ab'),
    name: name ?? p.name,
    preset,
    width: p.width,
    height: p.height,
    background: { type: 'solid', color: '#FFFFFF' },
    layers: [],
  };
}

export interface CreateProjectOptions {
  name?: string;
  preset?: ArtboardPresetId;
  locale?: LocaleCode;
}

export function createDefaultProject(
  options: CreateProjectOptions = {},
): CalqoProject {
  const now = new Date().toISOString();
  const locale = options.locale ?? DEFAULT_LOCALE;
  const preset = options.preset ?? DEFAULT_PRESET_ID;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: createId('proj'),
    name: options.name ?? 'Untitled project',
    createdAt: now,
    updatedAt: now,
    contentLocales: [locale],
    activeContentLocale: locale,
    palette: [...DEFAULT_PALETTE],
    artboards: [createArtboard(preset)],
    assets: [],
  };
}

export { ARTBOARD_PRESETS };
