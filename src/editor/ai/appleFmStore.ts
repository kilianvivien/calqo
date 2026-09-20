import { create } from 'zustand';
import {
  appleFm,
  type AppleFmPreflight,
  type AppleFmStatus,
} from '@/lib/adapters';
import { isTauri } from '@/lib/platform/runtime';
import { aiSettingsStore } from './aiSettings';

const STOPPED: AppleFmStatus = {
  running: false,
  port: null,
  managed: false,
  error: null,
};

interface AppleFmState {
  preflight: AppleFmPreflight | null;
  status: AppleFmStatus;
  pending: boolean;
  error: string | null;
  initialize(): Promise<void>;
  refresh(): Promise<void>;
  ensureRunning(force?: boolean): Promise<void>;
  stop(): Promise<void>;
}

function configuredPort(): number | undefined {
  const baseUrl = aiSettingsStore.getState().settings.providers.apple.baseUrl;
  try {
    const url = new URL(baseUrl);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return undefined;
    const port = Number(url.port);
    return Number.isInteger(port) && port > 0 && port <= 65_535
      ? port
      : undefined;
  } catch {
    return undefined;
  }
}

function preflightError(preflight: AppleFmPreflight): string | null {
  if (!preflight.installed || !preflight.osOk) return 'notInstalled';
  if (!preflight.licensed) return 'notLicensed';
  if (preflight.model === 'available') return null;
  if (preflight.model === 'not_eligible') return 'notEligible';
  if (preflight.model === 'intelligence_off') return 'intelligenceOff';
  if (preflight.model === 'not_ready') return 'notReady';
  return 'unavailable';
}

export const useAppleFmStore = create<AppleFmState>((set, get) => ({
  preflight: null,
  status: STOPPED,
  pending: false,
  error: null,

  async initialize() {
    const settings = aiSettingsStore.getState().settings;
    if (
      settings.providerId !== 'apple' ||
      settings.providers.apple.enabled !== true
    ) {
      return;
    }
    await get().ensureRunning();
  },

  async refresh() {
    if (!isTauri) return;
    try {
      const [preflight, status] = await Promise.all([
        appleFm.preflight(),
        appleFm.status(),
      ]);
      set({ preflight, status, error: status.error });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  async ensureRunning(force = false) {
    const settings = aiSettingsStore.getState().settings;
    if (
      get().pending ||
      (!force &&
        (settings.providerId !== 'apple' ||
          settings.providers.apple.enabled !== true))
    ) {
      return;
    }
    if (!isTauri) {
      set({ error: 'notInstalled', status: STOPPED });
      return;
    }
    set({ pending: true, error: null });
    try {
      const current = await appleFm.status();
      if (current.running && current.port !== null) {
        aiSettingsStore.getState().updateProviderConfig('apple', {
          baseUrl: `http://127.0.0.1:${current.port}/v1`,
        });
        set({ status: current, error: null });
        return;
      }
      const preflight = await appleFm.preflight();
      set({ preflight });
      const issue = preflightError(preflight);
      if (issue) throw new Error(issue);

      const port = await appleFm.start(configuredPort());
      const status = await appleFm.status();
      aiSettingsStore.getState().updateProviderConfig('apple', {
        baseUrl: `http://127.0.0.1:${port}/v1`,
      });
      set({ status, error: status.error });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: { ...STOPPED, error: message }, error: message });
    } finally {
      set({ pending: false });
    }
  },

  async stop() {
    try {
      if (isTauri) await appleFm.stop();
      set({ status: STOPPED, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
}));

export const appleFmStore = useAppleFmStore;
export { configuredPort, preflightError };
