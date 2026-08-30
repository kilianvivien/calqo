import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  legacyGet: vi.fn(),
  legacyRemove: vi.fn(),
  exists: vi.fn(),
  vaultGet: vi.fn(),
  vaultRemove: vi.fn(),
  vaultSave: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-store', () => ({
  Store: { load: async () => mocks },
}));
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: async () => '/app',
  join: async (...parts: string[]) => parts.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: mocks.exists }));
vi.mock('@tauri-apps/plugin-stronghold', () => ({
  Stronghold: {
    load: async () => ({
      loadClient: async () => ({
        getStore: () => ({ get: mocks.vaultGet, remove: mocks.vaultRemove }),
      }),
      save: mocks.vaultSave,
    }),
  },
}));
vi.mock('@/lib/adapters/settings/dexieSettingsAdapter', () => ({
  dexieSettingsAdapter: {
    get: mocks.legacyGet,
    remove: mocks.legacyRemove,
  },
}));
import { tauriSettingsAdapter } from '@/lib/adapters/settings/tauriSettingsAdapter';

const preferences = {
  providerId: 'custom',
  providers: { custom: { model: 'example', apiKey: 'test-secret' } },
};

describe('native credential storage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.invoke.mockResolvedValue(null);
    mocks.legacyGet.mockResolvedValue(null);
    mocks.exists.mockResolvedValue(false);
  });

  it('writes secrets only to Keychain, before writing non-secret preferences', async () => {
    await tauriSettingsAdapter.set('ai.settings', preferences);
    expect(mocks.invoke).toHaveBeenCalledWith('write_secret', {
      key: 'secure:ai.keys',
      value: '{"custom":"test-secret"}',
    });
    expect(JSON.stringify(mocks.set.mock.calls)).not.toContain('test-secret');
    expect(mocks.invoke.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.set.mock.invocationCallOrder[0],
    );
  });

  it('fails closed without writing ordinary preferences when Keychain is locked', async () => {
    mocks.invoke.mockRejectedValue(new Error('Keychain unavailable'));
    await expect(
      tauriSettingsAdapter.set('ai.settings', preferences),
    ).rejects.toThrow('Keychain unavailable');
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.legacyRemove).not.toHaveBeenCalled();
  });

  it('migrates old inline keys, preserving the preferences and returned credentials', async () => {
    mocks.get.mockResolvedValue(preferences);
    expect(await tauriSettingsAdapter.get('ai.settings')).toEqual(preferences);
    expect(mocks.invoke).toHaveBeenCalledWith(
      'write_secret',
      expect.objectContaining({ key: 'secure:ai.keys' }),
    );
    expect(JSON.stringify(mocks.set.mock.calls)).not.toContain('test-secret');
    expect(mocks.save).toHaveBeenCalled();
  });

  it('preserves legacy credentials when their durable migration fails', async () => {
    mocks.get.mockResolvedValue(preferences);
    mocks.invoke.mockImplementation(async (command) => {
      if (command === 'write_secret') throw new Error('Write denied');
      return null;
    });
    await expect(tauriSettingsAdapter.get('ai.settings')).rejects.toThrow(
      'Write denied',
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('erases migrated legacy vault entries only after Keychain persistence', async () => {
    mocks.exists.mockResolvedValue(true);
    mocks.vaultGet.mockResolvedValue(
      new TextEncoder().encode('"legacy-secret"'),
    );
    expect(await tauriSettingsAdapter.get('secure:test')).toBe('legacy-secret');
    expect(mocks.vaultRemove).toHaveBeenCalledWith('secure:test');
    expect(mocks.vaultSave).toHaveBeenCalled();
    expect(mocks.invoke.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.vaultRemove.mock.invocationCallOrder[0],
    );
  });

  it('removes legacy sources before deletion to prevent credential resurrection', async () => {
    await tauriSettingsAdapter.remove('secure:test');
    expect(mocks.legacyRemove).toHaveBeenCalledWith(
      'tauri-stronghold-fallback:secure:test',
    );
    expect(mocks.legacyRemove.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.invoke.mock.invocationCallOrder[0],
    );
    expect(mocks.invoke).toHaveBeenCalledWith('remove_secret', {
      key: 'secure:test',
    });
  });
});
