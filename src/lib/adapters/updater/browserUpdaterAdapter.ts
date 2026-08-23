import {
  UpdaterUnavailableError,
  type AvailableUpdate,
  type UpdaterAdapter,
} from './UpdaterAdapter';

/** The browser build ships through the service worker, not a signed bundle, so
 * in-app updates are a desktop-only concern (`PwaUpdatePrompt` covers the web).
 * This implementation exists so callers never have to branch on the platform. */
export const browserUpdaterAdapter: UpdaterAdapter = {
  supported: false,

  check(): Promise<AvailableUpdate | null> {
    return Promise.reject(
      new UpdaterUnavailableError(
        'platform',
        'In-app updates are available in the Calqo desktop app only.',
      ),
    );
  },

  restart(): Promise<void> {
    return Promise.resolve();
  },
};
