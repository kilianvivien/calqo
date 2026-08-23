/** Why an update check could not run. Kept separate from a generic failure so
 * the UI can stay quiet about builds that were never meant to self-update
 * (the browser app, or a desktop build made without a signing key). */
export type UpdaterUnavailableReason =
  | 'platform'
  | 'not-configured'
  | 'network';

export class UpdaterUnavailableError extends Error {
  constructor(
    readonly reason: UpdaterUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = 'UpdaterUnavailableError';
  }
}

/** Download progress, in bytes. `total` is 0 when the server sends no
 * content length. */
export interface UpdateDownloadProgress {
  downloaded: number;
  total: number;
}

/** A release newer than the running build, already verified against the
 * bundled public key by the time it reaches the UI. */
export interface AvailableUpdate {
  version: string;
  /** Release notes from the update manifest, when the release supplied any. */
  notes?: string;
  /** Publication date from the manifest, as reported by the backend. */
  date?: string;
  /** Download and install the new bundle. Does not restart the app. */
  install(
    onProgress?: (progress: UpdateDownloadProgress) => void,
  ): Promise<void>;
  /** Release the backend handle when the update is dismissed instead of
   * installed. Safe to call more than once. */
  dispose(): Promise<void>;
}

/** Auto-update boundary. Desktop resolves this to the Tauri updater plugin;
 * the browser build resolves it to an implementation that reports the feature
 * as unavailable, because service-worker updates cover that surface instead
 * (see `PwaUpdatePrompt`). */
export interface UpdaterAdapter {
  /** True when this build can check for and install updates at all. */
  readonly supported: boolean;
  /** Resolve the newest release, or `null` when already up to date.
   * Throws `UpdaterUnavailableError` when the check itself could not run. */
  check(): Promise<AvailableUpdate | null>;
  /** Restart into the freshly installed version. */
  restart(): Promise<void>;
}
