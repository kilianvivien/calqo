import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { artboardOverflowLayerIds } from '@/editor/commands/projectCommands';

/** Pixel area above which a raster asset is flagged as heavy for the browser
 * canvas (≈ 16 MP, e.g. a 4000×4000 image). */
export const LARGE_ASSET_PIXELS = 16_000_000;

/** Artboard count above which exporting all at once is flagged as slow. */
export const MANY_ARTBOARDS = 12;

/** Build collision-free download stems for a batch of artboards. Artboards with
 * duplicate names (a common result of duplicate-to-preset) get a numeric suffix
 * so a batch export never overwrites earlier files. Order is preserved. */
export function uniqueArtboardStems(
  targets: { name: string }[],
  slug: (value: string) => string,
): string[] {
  const counts = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const target of targets) {
    const key = slug(target.name);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return targets.map((target) => {
    const key = slug(target.name);
    if ((totals.get(key) ?? 0) <= 1) return key;
    const seen = (counts.get(key) ?? 0) + 1;
    counts.set(key, seen);
    return `${key}-${seen}`;
  });
}

export interface ExportWarningInput {
  project: CalqoProject | null;
  targets: CalqoArtboard[];
  /** Whether this run exports every artboard (drives the "many artboards" hint). */
  exportingAll: boolean;
}

/** Collect export-readiness warnings: layout overflow, missing assets, heavy
 * raster assets, and large batch sizes. Returns localized strings via `t`. */
export function collectExportWarnings(
  { project, targets, exportingAll }: ExportWarningInput,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string[] {
  if (!project) return [];
  const messages: string[] = [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));

  for (const artboard of targets) {
    if (artboardOverflowLayerIds(artboard).length > 0) {
      messages.push(t('export.warnOverflow', { name: artboard.name }));
    }
    let missing = false;
    for (const layer of artboard.layers) {
      if (layer.type !== 'image' && layer.type !== 'svg') continue;
      const asset = assets.get(layer.assetId);
      if (!asset) {
        missing = true;
        continue;
      }
      if (
        asset.width &&
        asset.height &&
        asset.width * asset.height > LARGE_ASSET_PIXELS
      ) {
        messages.push(
          t('export.warnLargeAsset', {
            name: asset.name,
            width: asset.width,
            height: asset.height,
          }),
        );
      }
    }
    if (missing) messages.push(t('export.warnMissingAsset', { name: artboard.name }));
  }

  if (exportingAll && targets.length > MANY_ARTBOARDS) {
    messages.push(t('export.warnManyArtboards', { count: targets.length }));
  }

  return [...new Set(messages)];
}
