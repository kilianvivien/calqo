import { create } from 'zustand';
import {
  appSettings,
  appUpdater,
  UpdaterUnavailableError,
  type AvailableUpdate,
  type UpdaterUnavailableReason,
} from '@/lib/adapters';

const SETTINGS_KEY = 'updates.settings';

/** Desktop auto-update state. Settings persist through the settings adapter;
 * everything else (the resolved release, download progress, errors) is
 * session-scoped — a relaunch re-checks from scratch.
 *
 * The browser build resolves `appUpdater` to an unsupported implementation, so
 * this store stays in `unsupported` there and no UI is shown. */

export type UpdatePhase =
  /** Nothing in flight and no update pending. */
  | 'idle'
  /** A check is running. */
  | 'checking'
  /** A newer release was found but has not been downloaded yet. */
  | 'available'
  /** The new bundle is downloading/installing. */
  | 'downloading'
  /** Installed on disk; a restart switches to it. */
  | 'ready'
  /** The last check or install failed. */
  | 'error'
  /** This build cannot self-update at all. */
  | 'unsupported';

export interface UpdateSettings {
  /** Check on launch and periodically while the app is open. */
  autoCheck: boolean;
  /** Version the user chose to skip; the banner stays quiet for it. */
  skippedVersion: string | null;
}

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  autoCheck: true,
  skippedVersion: null,
};

export interface UpdateError {
  reason: UpdaterUnavailableReason | 'install' | 'signature';
  message: string;
}

export function normalizeUpdateSettings(
  stored?: Partial<UpdateSettings> | null,
): UpdateSettings {
  return {
    autoCheck:
      typeof stored?.autoCheck === 'boolean'
        ? stored.autoCheck
        : DEFAULT_UPDATE_SETTINGS.autoCheck,
    skippedVersion:
      typeof stored?.skippedVersion === 'string' ? stored.skippedVersion : null,
  };
}

let persistChain: Promise<void> = Promise.resolve();

function persist(settings: UpdateSettings): void {
  const snapshot = { ...settings };
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => appSettings.set(SETTINGS_KEY, snapshot))
    .catch((err) => {
      console.error('[Calqo] failed to persist update settings', err);
    });
}

/** The signature is only verified once the new bundle has been downloaded, so
 * an unsigned build and a tampered download both surface here rather than at
 * check time. Both mean the same thing to the user: this download was not
 * trustworthy and nothing was installed. */
const SIGNATURE_FAILURE = /signature|minisign|encoding/i;

function toUpdateError(error: unknown): UpdateError {
  if (error instanceof UpdaterUnavailableError) {
    return { reason: error.reason, message: error.message };
  }
  const message =
    (error as { message?: string } | undefined)?.message ?? String(error);
  return {
    reason: SIGNATURE_FAILURE.test(message) ? 'signature' : 'install',
    message,
  };
}

export interface UpdaterState {
  settings: UpdateSettings;
  loaded: boolean;
  phase: UpdatePhase;
  /** The pending release, kept so the install step can reuse the handle. */
  update: AvailableUpdate | null;
  version: string | null;
  notes: string | null;
  downloaded: number;
  total: number;
  error: UpdateError | null;
  /** Epoch ms of the last completed check, successful or not. */
  lastCheckedAt: number | null;

  load: () => Promise<void>;
  setAutoCheck: (autoCheck: boolean) => void;
  check: () => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
  /** Hide the banner for this version without installing. */
  skipCurrent: () => void;
  /** Hide the banner but offer the update again on the next check. */
  dismiss: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  settings: DEFAULT_UPDATE_SETTINGS,
  loaded: false,
  phase: 'idle',
  update: null,
  version: null,
  notes: null,
  downloaded: 0,
  total: 0,
  error: null,
  lastCheckedAt: null,

  load: async () => {
    // Resolved here rather than in the initial state: reading the adapter at
    // module scope would make importing this store require a live adapter
    // layer, which the browser build and the unit suites do not provide.
    if (!appUpdater.supported && get().phase !== 'unsupported') {
      set({ phase: 'unsupported' });
    }
    if (get().loaded) return;
    try {
      const stored =
        await appSettings.get<Partial<UpdateSettings>>(SETTINGS_KEY);
      set({ settings: normalizeUpdateSettings(stored), loaded: true });
    } catch (err) {
      console.error('[Calqo] failed to load update settings', err);
      set({ loaded: true });
    }
  },

  setAutoCheck: (autoCheck) => {
    const settings = { ...get().settings, autoCheck };
    set({ settings });
    persist(settings);
  },

  check: async () => {
    if (!appUpdater.supported) {
      set({ phase: 'unsupported' });
      return;
    }
    const phase = get().phase;
    // Never interrupt work already in flight, and never re-check away from an
    // update that is already downloaded and waiting for a restart.
    if (phase === 'checking' || phase === 'downloading' || phase === 'ready') {
      return;
    }

    set({ phase: 'checking', error: null });
    try {
      const update = await appUpdater.check();
      // Release the handle from any previous check before replacing it.
      void get().update?.dispose();
      if (!update) {
        set({
          phase: 'idle',
          update: null,
          version: null,
          notes: null,
          lastCheckedAt: Date.now(),
        });
        return;
      }
      set({
        phase: 'available',
        update,
        version: update.version,
        notes: update.notes ?? null,
        downloaded: 0,
        total: 0,
        lastCheckedAt: Date.now(),
      });
    } catch (err) {
      set({
        phase: 'error',
        error: toUpdateError(err),
        lastCheckedAt: Date.now(),
      });
    }
  },

  install: async () => {
    const update = get().update;
    if (!update || get().phase === 'downloading') return;
    set({ phase: 'downloading', downloaded: 0, total: 0, error: null });
    try {
      await update.install((progress) => {
        set({ downloaded: progress.downloaded, total: progress.total });
      });
      set({ phase: 'ready' });
    } catch (err) {
      set({ phase: 'error', error: toUpdateError(err) });
    }
  },

  restart: async () => {
    await appUpdater.restart();
  },

  skipCurrent: () => {
    const version = get().version;
    const settings = { ...get().settings, skippedVersion: version };
    set({ settings, phase: 'idle' });
    void get().update?.dispose();
    set({ update: null });
    persist(settings);
  },

  dismiss: () => {
    if (get().phase === 'available') {
      void get().update?.dispose();
      set({ phase: 'idle', update: null });
      return;
    }
    if (get().phase === 'error') set({ phase: 'idle', error: null });
  },
}));

/** Whether the update banner should be visible right now. Only a release that
 * can actually be installed earns the interruption: an up-to-date result, a
 * failed check, and a skipped version are all reported in Settings instead. */
export function shouldShowUpdateBanner(state: UpdaterState): boolean {
  if (state.phase === 'ready' || state.phase === 'downloading') return true;
  if (state.phase !== 'available') return false;
  return state.version !== state.settings.skippedVersion;
}
