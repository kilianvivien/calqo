import { PROVIDER_PRESETS, type AiSettings } from '@/editor/ai/aiSettings';
import { collectExportWarnings } from '@/editor/export/exportReadiness';
import type { CalqoArtboard, CalqoLayer, CalqoProject } from '@/lib/schema';

export interface LayerDiagnostics {
  total: number;
  byType: Record<CalqoLayer['type'], number>;
  hidden: number;
  locked: number;
}

export interface ProjectDiagnostics {
  generatedAt: string;
  project: {
    id: string;
    name: string;
    schemaVersion: number;
    contentLocales: string[];
    activeContentLocale: string;
    artboards: number;
    assets: number;
    glossaryTerms: number;
  };
  artboards: {
    id: string;
    name: string;
    preset: string;
    width: number;
    height: number;
    layers: LayerDiagnostics;
    warningCount: number;
    warnings: string[];
  }[];
  warnings: {
    total: number;
    unique: string[];
  };
  provider: {
    id: string;
    label: string;
    mode: 'offline' | 'remote';
    needsKey: boolean;
    keyConfigured: boolean;
    storeKey: boolean;
    modelConfigured: boolean;
    baseUrlConfigured: boolean;
  };
}

const LAYER_TYPES: CalqoLayer['type'][] = [
  'text',
  'shape',
  'image',
  'svg',
  'list',
  'group',
];

function emptyLayerCounts(): Record<CalqoLayer['type'], number> {
  return Object.fromEntries(LAYER_TYPES.map((type) => [type, 0])) as Record<
    CalqoLayer['type'],
    number
  >;
}

export function layerDiagnostics(layers: CalqoLayer[]): LayerDiagnostics {
  const result: LayerDiagnostics = {
    total: 0,
    byType: emptyLayerCounts(),
    hidden: 0,
    locked: 0,
  };

  const visit = (layer: CalqoLayer) => {
    result.total += 1;
    result.byType[layer.type] += 1;
    if (!layer.visible) result.hidden += 1;
    if (layer.locked) result.locked += 1;
    if (layer.type === 'group') layer.children.forEach(visit);
  };

  layers.forEach(visit);
  return result;
}

export function artboardDiagnostics(
  project: CalqoProject,
  artboard: CalqoArtboard,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const warnings = collectExportWarnings({
    project,
    targets: [artboard],
    exportingAll: false,
  }, t);
  return {
    id: artboard.id,
    name: artboard.name,
    preset: artboard.preset,
    width: artboard.width,
    height: artboard.height,
    layers: layerDiagnostics(artboard.layers),
    warningCount: warnings.length,
    warnings,
  };
}

export function buildProjectDiagnostics(
  project: CalqoProject,
  settings: AiSettings,
  t: (key: string, opts?: Record<string, unknown>) => string,
  generatedAt = new Date().toISOString(),
): ProjectDiagnostics {
  const preset = PROVIDER_PRESETS[settings.providerId];
  const config = settings.providers[settings.providerId];
  const artboards = project.artboards.map((artboard) =>
    artboardDiagnostics(project, artboard, t),
  );
  const uniqueWarnings = [
    ...new Set(artboards.flatMap((artboard) => artboard.warnings)),
  ];

  return {
    generatedAt,
    project: {
      id: project.id,
      name: project.name,
      schemaVersion: project.schemaVersion,
      contentLocales: project.contentLocales,
      activeContentLocale: project.activeContentLocale,
      artboards: project.artboards.length,
      assets: project.assets.length,
      glossaryTerms: project.glossary.length,
    },
    artboards,
    warnings: {
      total: artboards.reduce((sum, artboard) => sum + artboard.warningCount, 0),
      unique: uniqueWarnings,
    },
    provider: {
      id: preset.id,
      label: preset.label,
      mode: preset.remote ? 'remote' : 'offline',
      needsKey: preset.needsKey,
      keyConfigured: Boolean(config.apiKey),
      storeKey: settings.storeKey,
      modelConfigured: Boolean(config.model || preset.defaultModel),
      baseUrlConfigured: Boolean(
        (preset.editableBaseUrl ? config.baseUrl : preset.baseUrl).trim(),
      ),
    },
  };
}
