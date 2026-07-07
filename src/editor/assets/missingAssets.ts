import { assetStorage } from '@/lib/adapters';
import { isGroupLayer } from '@/editor/utils/layers';
import type { CalqoLayer, CalqoProject } from '@/lib/schema';

/** Where a broken asset reference is used, so the repair UI can name it. */
export interface AssetLayerRef {
  artboardId: string;
  artboardName: string;
  /** Absent for artboard-background references. */
  layerId?: string;
  layerName?: string;
  role: 'layer' | 'fill' | 'marker' | 'background';
}

export interface MissingAsset {
  assetId: string;
  kind: 'image' | 'svg';
  /** Suggested display name (from the manifest when the ref survives). */
  name?: string;
  layerRefs: AssetLayerRef[];
}

/** Collect every *rendered* asset reference in the project (image/svg layers,
 * image fills, list markers, image backgrounds), keyed by asset id. Background
 * -removal source refs are intentionally excluded — a missing source only
 * matters on reset, not for rendering. */
export function collectAssetUsage(
  project: CalqoProject,
): Map<string, AssetLayerRef[]> {
  const usage = new Map<string, AssetLayerRef[]>();
  const add = (assetId: string, ref: AssetLayerRef) => {
    const refs = usage.get(assetId) ?? [];
    refs.push(ref);
    usage.set(assetId, refs);
  };

  for (const artboard of project.artboards) {
    if (artboard.background.type === 'image') {
      add(artboard.background.assetId, {
        artboardId: artboard.id,
        artboardName: artboard.name,
        role: 'background',
      });
    }
    const visit = (layers: CalqoLayer[]) => {
      for (const layer of layers) {
        const base = {
          artboardId: artboard.id,
          artboardName: artboard.name,
          layerId: layer.id,
          layerName: layer.name,
        };
        if (layer.type === 'image' || layer.type === 'svg') {
          add(layer.assetId, { ...base, role: 'layer' });
        }
        if (layer.type === 'shape' && layer.fill.type === 'image') {
          add(layer.fill.assetId, { ...base, role: 'fill' });
        }
        if (
          layer.type === 'list' &&
          layer.marker.kind === 'asset' &&
          layer.marker.assetId
        ) {
          add(layer.marker.assetId, { ...base, role: 'marker' });
        }
        if (isGroupLayer(layer)) visit(layer.children);
      }
    };
    visit(artboard.layers);
  }
  return usage;
}

/** Infer the asset kind for a broken reference: prefer the manifest entry,
 * fall back to the referencing layer's type. */
function inferKind(
  project: CalqoProject,
  assetId: string,
  refs: AssetLayerRef[],
): 'image' | 'svg' {
  const manifest = project.assets.find((ref) => ref.id === assetId);
  if (manifest) return manifest.kind === 'svg' ? 'svg' : 'image';
  const layerRef = refs.find((ref) => ref.role === 'layer');
  if (layerRef) {
    for (const artboard of project.artboards) {
      const find = (layers: CalqoLayer[]): CalqoLayer | null => {
        for (const layer of layers) {
          if (layer.id === layerRef.layerId) return layer;
          if (isGroupLayer(layer)) {
            const nested = find(layer.children);
            if (nested) return nested;
          }
        }
        return null;
      };
      const layer = find(artboard.layers);
      if (layer?.type === 'svg') return 'svg';
      if (layer) return 'image';
    }
  }
  return 'image';
}

/** Pure detection: given the set of asset ids whose blobs are actually
 * available, list every referenced asset that cannot resolve. */
export function findMissingAssets(
  project: CalqoProject,
  availableAssetIds: Set<string>,
): MissingAsset[] {
  const usage = collectAssetUsage(project);
  const missing: MissingAsset[] = [];
  for (const [assetId, layerRefs] of usage) {
    if (availableAssetIds.has(assetId)) continue;
    missing.push({
      assetId,
      kind: inferKind(project, assetId, layerRefs),
      name: project.assets.find((ref) => ref.id === assetId)?.name,
      layerRefs,
    });
  }
  return missing;
}

/** Async detection against the asset store: an asset is available only when its
 * blob can actually be read back. Used on project open, `.calqo` import, and by
 * the diagnostics / repair surfaces. */
export async function detectMissingAssets(
  project: CalqoProject,
): Promise<MissingAsset[]> {
  const referenced = [...collectAssetUsage(project).keys()];
  const available = new Set<string>();
  await Promise.all(
    referenced.map(async (assetId) => {
      const blob = await assetStorage.getAssetBlob(assetId).catch(() => null);
      if (blob) available.add(assetId);
    }),
  );
  return findMissingAssets(project, available);
}
