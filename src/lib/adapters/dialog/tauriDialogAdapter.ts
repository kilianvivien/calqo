import type { DialogAdapter } from './DialogAdapter';

export const tauriDialogAdapter: DialogAdapter = {
  async confirm(prompt): Promise<boolean> {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    return confirm(prompt.message, {
      title: prompt.title,
      kind: 'warning',
    });
  },
};

