import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvailableUpdate,
  UpdateDownloadProgress,
} from '@/lib/adapters/updater/UpdaterAdapter';
import { UpdaterUnavailableError } from '@/lib/adapters/updater/UpdaterAdapter';

const mocks = vi.hoisted(() => ({
  supported: true,
  check: vi.fn(),
  restart: vi.fn(),
  settingsGet: vi.fn(),
  settingsSet: vi.fn(),
}));

vi.mock('@/lib/adapters', async () => {
  const module = await import('@/lib/adapters/updater/UpdaterAdapter');
  return {
    UpdaterUnavailableError: module.UpdaterUnavailableError,
    appUpdater: {
      get supported() {
        return mocks.supported;
      },
      check: mocks.check,
      restart: mocks.restart,
    },
    appSettings: {
      get: mocks.settingsGet,
      set: mocks.settingsSet,
    },
  };
});

const { useUpdaterStore, normalizeUpdateSettings, shouldShowUpdateBanner } =
  await import('@/lib/state/updaterStore');

const INITIAL = useUpdaterStore.getState();

function fakeUpdate(overrides: Partial<AvailableUpdate> = {}): AvailableUpdate {
  return {
    version: '0.7.0',
    notes: 'Faster export.',
    install: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('update settings', () => {
  it('falls back to auto-checking when nothing is stored', () => {
    expect(normalizeUpdateSettings(null)).toEqual({
      autoCheck: true,
      skippedVersion: null,
    });
  });

  it('keeps stored values and rejects malformed ones', () => {
    expect(
      normalizeUpdateSettings({
        autoCheck: false,
        skippedVersion: '0.7.0',
      }),
    ).toEqual({ autoCheck: false, skippedVersion: '0.7.0' });
    expect(
      normalizeUpdateSettings({
        autoCheck: 'yes',
        skippedVersion: 12,
      } as never),
    ).toEqual({ autoCheck: true, skippedVersion: null });
  });
});

describe('updater store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supported = true;
    mocks.settingsGet.mockResolvedValue(null);
    mocks.settingsSet.mockResolvedValue(undefined);
    useUpdaterStore.setState({
      ...INITIAL,
      phase: 'idle',
      settings: { autoCheck: true, skippedVersion: null },
      loaded: false,
      update: null,
      version: null,
      notes: null,
      error: null,
      lastCheckedAt: null,
      downloaded: 0,
      total: 0,
    });
  });

  it('reports an up-to-date build without leaving a pending update', async () => {
    mocks.check.mockResolvedValue(null);
    await useUpdaterStore.getState().check();
    const state = useUpdaterStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.update).toBeNull();
    expect(state.lastCheckedAt).not.toBeNull();
    expect(shouldShowUpdateBanner(state)).toBe(false);
  });

  it('surfaces a newer release and shows the banner', async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await useUpdaterStore.getState().check();
    const state = useUpdaterStore.getState();
    expect(state.phase).toBe('available');
    expect(state.version).toBe('0.7.0');
    expect(state.notes).toBe('Faster export.');
    expect(shouldShowUpdateBanner(state)).toBe(true);
  });

  it('classifies an unsigned build as a configuration problem', async () => {
    mocks.check.mockRejectedValue(
      new UpdaterUnavailableError('not-configured', 'no pubkey'),
    );
    await useUpdaterStore.getState().check();
    const state = useUpdaterStore.getState();
    expect(state.phase).toBe('error');
    expect(state.error?.reason).toBe('not-configured');
    expect(shouldShowUpdateBanner(state)).toBe(false);
  });

  it('reports download progress and ends ready to restart', async () => {
    const install = vi.fn(
      async (onProgress?: (progress: UpdateDownloadProgress) => void) => {
        onProgress?.({ downloaded: 50, total: 200 });
        onProgress?.({ downloaded: 200, total: 200 });
      },
    );
    mocks.check.mockResolvedValue(fakeUpdate({ install }));
    await useUpdaterStore.getState().check();
    await useUpdaterStore.getState().install();
    const state = useUpdaterStore.getState();
    expect(install).toHaveBeenCalledOnce();
    expect(state.phase).toBe('ready');
    expect(state.downloaded).toBe(200);
    expect(state.total).toBe(200);
    expect(shouldShowUpdateBanner(state)).toBe(true);
  });

  it('names a verification failure instead of blaming the install', async () => {
    mocks.check.mockResolvedValue(
      fakeUpdate({
        install: vi.fn(async () => {
          throw new Error('The signature verification failed');
        }),
      }),
    );
    await useUpdaterStore.getState().check();
    await useUpdaterStore.getState().install();
    expect(useUpdaterStore.getState().error?.reason).toBe('signature');
  });

  it('keeps a failed install out of the ready state', async () => {
    mocks.check.mockResolvedValue(
      fakeUpdate({
        install: vi.fn(async () => {
          throw new Error('disk full');
        }),
      }),
    );
    await useUpdaterStore.getState().check();
    await useUpdaterStore.getState().install();
    const state = useUpdaterStore.getState();
    expect(state.phase).toBe('error');
    expect(state.error).toEqual({ reason: 'install', message: 'disk full' });
  });

  it('never re-checks away from an update waiting to be installed', async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await useUpdaterStore.getState().check();
    await useUpdaterStore.getState().install();
    expect(useUpdaterStore.getState().phase).toBe('ready');

    await useUpdaterStore.getState().check();
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(useUpdaterStore.getState().phase).toBe('ready');
  });

  it('hides the banner for a skipped version but keeps it in Settings', async () => {
    const update = fakeUpdate();
    mocks.check.mockResolvedValue(update);
    await useUpdaterStore.getState().check();
    useUpdaterStore.getState().skipCurrent();

    expect(update.dispose).toHaveBeenCalled();
    // Persistence is queued behind a promise chain so a click never awaits I/O.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.settingsSet).toHaveBeenCalledWith('updates.settings', {
      autoCheck: true,
      skippedVersion: '0.7.0',
    });

    mocks.check.mockResolvedValue(fakeUpdate());
    await useUpdaterStore.getState().check();
    const state = useUpdaterStore.getState();
    expect(state.phase).toBe('available');
    expect(shouldShowUpdateBanner(state)).toBe(false);
  });

  it('marks itself unsupported in the browser build and never checks', async () => {
    mocks.supported = false;
    await useUpdaterStore.getState().load();
    expect(useUpdaterStore.getState().phase).toBe('unsupported');

    await useUpdaterStore.getState().check();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(useUpdaterStore.getState().phase).toBe('unsupported');
  });
});
