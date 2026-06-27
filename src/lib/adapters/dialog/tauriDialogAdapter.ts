import type { DialogAdapter } from './DialogAdapter';

export const tauriDialogAdapter: DialogAdapter = {
  async confirm(options): Promise<boolean> {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    return confirm(options.message, {
      title: options.title,
      kind: options.danger ? 'warning' : 'info',
      okLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
    });
  },
};
