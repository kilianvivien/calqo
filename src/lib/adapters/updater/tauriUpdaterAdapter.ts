import {
  UpdaterUnavailableError,
  type AvailableUpdate,
  type UpdaterAdapter,
  type UpdaterUnavailableReason,
} from './UpdaterAdapter';

/** Classify a failure from the Tauri updater plugin. A build whose public key
 * or endpoint list is missing is a packaging problem, not something the user
 * can retry, so it is reported separately from a transient network failure. */
function classify(error: unknown): UpdaterUnavailableReason {
  const message = String(
    (error as { message?: string } | undefined)?.message ?? error ?? '',
  ).toLowerCase();
  if (
    message.includes('pubkey') ||
    message.includes('public key') ||
    message.includes('minisign') ||
    message.includes('endpoint')
  ) {
    return 'not-configured';
  }
  return 'network';
}

export const tauriUpdaterAdapter: UpdaterAdapter = {
  supported: true,

  async check(): Promise<AvailableUpdate | null> {
    const { check } = await import('@tauri-apps/plugin-updater');
    let update: Awaited<ReturnType<typeof check>>;
    try {
      update = await check();
    } catch (error) {
      throw new UpdaterUnavailableError(classify(error), String(error));
    }
    if (!update) return null;

    return {
      version: update.version,
      notes: update.body || undefined,
      date: update.date || undefined,
      async install(onProgress) {
        let downloaded = 0;
        let total = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0;
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
          } else {
            downloaded = total || downloaded;
          }
          onProgress?.({ downloaded, total });
        });
      },
      async dispose() {
        try {
          await update.close();
        } catch {
          /* The handle is already gone — nothing to release. */
        }
      },
    };
  },

  async restart(): Promise<void> {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  },
};
