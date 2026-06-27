import { create } from 'zustand';
import type { ConfirmOptions } from '@/lib/adapters/dialog/DialogAdapter';

/** A single in-flight confirmation request. `id` lets the host remount its
 * modal (resetting the entrance animation) when a new request replaces an old
 * one. */
interface ConfirmRequest extends ConfirmOptions {
  id: number;
}

interface ConfirmState {
  request: ConfirmRequest | null;
  /** Open a confirmation and resolve once the user (or the host) answers. */
  open: (options: ConfirmOptions) => Promise<boolean>;
  /** Called by the host when the user accepts or dismisses. */
  respond: (value: boolean) => void;
}

let counter = 0;
let activeResolver: ((value: boolean) => void) | null = null;

/** App-level confirmation queue. The dialog adapter funnels every
 * `confirm()` here so confirmations render as in-app glass modals (via
 * `ConfirmHost`) instead of the native `window.confirm`, keeping the chrome
 * consistent across the whole app. */
export const useConfirmStore = create<ConfirmState>((set) => ({
  request: null,

  open: (options) =>
    new Promise<boolean>((resolve) => {
      // A new request supersedes any still-pending one (resolve it as declined).
      activeResolver?.(false);
      activeResolver = resolve;
      set({ request: { ...options, id: ++counter } });
    }),

  respond: (value) => {
    const resolve = activeResolver;
    activeResolver = null;
    set({ request: null });
    resolve?.(value);
  },
}));

/** Non-reactive accessor for the dialog adapter. */
export const confirmStore = useConfirmStore;
