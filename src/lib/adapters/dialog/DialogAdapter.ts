/** Options for a confirmation prompt. `confirmLabel`/`cancelLabel` and `danger`
 * are honoured by the in-app dialog; the native (Tauri) backend uses what it
 * can and ignores the rest. */
export interface ConfirmOptions {
  title?: string;
  message: string;
  /** Label for the accept button (defaults to a generic "Confirm"). */
  confirmLabel?: string;
  /** Label for the dismiss button (defaults to "Cancel"). */
  cancelLabel?: string;
  /** Style the accept action as destructive. */
  danger?: boolean;
}

/** Dialog boundary. The browser implementation renders an in-app glass modal
 * (via the confirm store + `ConfirmHost`); a Tauri build swaps in the OS-native
 * confirm dialog. */
export interface DialogAdapter {
  /** Ask the user to confirm an action. Resolves `true` when accepted. Returns
   * `true` in non-interactive contexts (no DOM) so automated flows are never
   * blocked. */
  confirm(options: ConfirmOptions): Promise<boolean>;
}

/** Non-secret marker prefix used when a secure setting had to fall back to a
 * weaker storage backend. The marker never contains the secret value itself. */
export const INSECURE_SECRET_FALLBACK_PREFIX = 'insecure-secret-fallback:';
