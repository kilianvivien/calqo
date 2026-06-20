/** Native dialog boundary. The browser implementation uses `window.confirm`;
 * a Tauri build will swap in the OS-native ask/confirm dialog later. */
export interface DialogAdapter {
  /** Ask the user to confirm a destructive action. Resolves `true` when the
   * user accepts. Returns `true` in non-interactive contexts (no `window`) so
   * automated flows are never blocked. */
  confirm(options: { title?: string; message: string }): Promise<boolean>;
}
