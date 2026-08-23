import { appUpdater } from '@/lib/adapters';
import { useUpdaterStore } from '@/lib/state/updaterStore';

/** Wait for the window to settle before the first check: launch is already
 * busy hydrating the workspace, and an update is never urgent. */
const FIRST_CHECK_DELAY_MS = 8_000;

/** Long-running sessions re-check on this cadence. */
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Start background update checks for the desktop shell. Returns a cleanup
 * function; safe to call in the browser build, where it does nothing.
 *
 * A background check never interrupts: it only fills in the state that
 * Settings ▸ Updates reads, and shows a prompt when there is actually
 * something to install. */
export function initAutoUpdate(): () => void {
  if (!appUpdater.supported) return () => {};

  let disposed = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const runCheck = () => {
    if (disposed) return;
    if (!useUpdaterStore.getState().settings.autoCheck) return;
    void useUpdaterStore.getState().check();
  };

  const first = setTimeout(() => {
    void useUpdaterStore
      .getState()
      .load()
      .then(() => {
        runCheck();
        if (!disposed) interval = setInterval(runCheck, RECHECK_INTERVAL_MS);
      });
  }, FIRST_CHECK_DELAY_MS);

  return () => {
    disposed = true;
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
