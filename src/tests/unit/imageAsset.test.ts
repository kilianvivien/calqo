import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveImageBlobAsset } from '@/lib/utils/imageAsset';

const adapterMocks = vi.hoisted(() => ({
  assetStorage: {
    saveAsset: vi.fn(),
    getAssetBlob: vi.fn(),
    deleteAsset: vi.fn(),
    restoreAsset: vi.fn(),
  },
}));

vi.mock('@/lib/adapters', () => adapterMocks);

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

class FakeImage {
  naturalWidth = 512;
  naturalHeight = 512;
  onload: (() => void) | null = null;

  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('image asset utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Image', FakeImage);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:asset'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    adapterMocks.assetStorage.saveAsset.mockResolvedValue({
      id: 'asset-1',
      kind: 'raster',
      name: 'logo.png',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      storageKey: 'asset-1',
      createdAt: '2026-06-28T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it('measures blob-backed raster assets before saving them', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/png' });

    await saveImageBlobAsset('project-1', blob, {
      name: 'logo.png',
      mimeType: 'image/png',
    });

    expect(adapterMocks.assetStorage.saveAsset).toHaveBeenCalledWith('project-1', blob, {
      kind: 'raster',
      name: 'logo.png',
      mimeType: 'image/png',
      width: 512,
      height: 512,
    });
  });
});
