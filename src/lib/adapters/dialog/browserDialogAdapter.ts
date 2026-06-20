import type { DialogAdapter } from './DialogAdapter';

export const browserDialogAdapter: DialogAdapter = {
  async confirm({ title, message }): Promise<boolean> {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return true;
    }
    const body = title ? `${title}\n\n${message}` : message;
    return window.confirm(body);
  },
};
