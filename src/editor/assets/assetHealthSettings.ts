import { appSettings } from '@/lib/adapters';
import {
  DEFAULT_ASSET_HEALTH_THRESHOLDS,
  useUiStore,
  type AssetHealthThresholds,
} from '@/lib/state/uiStore';

export const ASSET_HEALTH_SETTINGS_KEY = 'assetHealth.thresholds';

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

export function normalizeAssetHealthThresholds(
  value: Partial<AssetHealthThresholds> | null | undefined,
): AssetHealthThresholds {
  return {
    maxAssetDecodedBytes: positive(value?.maxAssetDecodedBytes, DEFAULT_ASSET_HEALTH_THRESHOLDS.maxAssetDecodedBytes),
    maxAssetEdge: positive(value?.maxAssetEdge, DEFAULT_ASSET_HEALTH_THRESHOLDS.maxAssetEdge),
    maxEnvelopeBytes: positive(value?.maxEnvelopeBytes, DEFAULT_ASSET_HEALTH_THRESHOLDS.maxEnvelopeBytes),
  };
}

export async function loadAssetHealthThresholds(): Promise<AssetHealthThresholds> {
  const saved = await appSettings.get<Partial<AssetHealthThresholds>>(ASSET_HEALTH_SETTINGS_KEY);
  const thresholds = normalizeAssetHealthThresholds(saved);
  useUiStore.setState({ assetHealthThresholds: thresholds });
  return thresholds;
}

export async function saveAssetHealthThresholds(
  value: Partial<AssetHealthThresholds>,
): Promise<AssetHealthThresholds> {
  const thresholds = normalizeAssetHealthThresholds({
    ...useUiStore.getState().assetHealthThresholds,
    ...value,
  });
  await appSettings.set(ASSET_HEALTH_SETTINGS_KEY, thresholds);
  useUiStore.setState({ assetHealthThresholds: thresholds });
  return thresholds;
}

export async function resetAssetHealthThresholds(): Promise<AssetHealthThresholds> {
  await appSettings.remove(ASSET_HEALTH_SETTINGS_KEY);
  const thresholds = { ...DEFAULT_ASSET_HEALTH_THRESHOLDS };
  useUiStore.setState({ assetHealthThresholds: thresholds });
  return thresholds;
}
