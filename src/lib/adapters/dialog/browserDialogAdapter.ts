import { confirmStore } from '@/lib/state/confirmStore';
import type { DialogAdapter } from './DialogAdapter';

export const browserDialogAdapter: DialogAdapter = {
  async confirm(options): Promise<boolean> {
    // No DOM (SSR / non-interactive): accept so automated flows never block.
    if (typeof document === 'undefined') return true;
    return confirmStore.getState().open(options);
  },
};
