import type { ClipboardAdapter } from './ClipboardAdapter';

export const browserClipboardAdapter: ClipboardAdapter = {
  canWriteImages(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'clipboard' in navigator &&
      typeof window !== 'undefined' &&
      'ClipboardItem' in window
    );
  },

  async writeImage(blob): Promise<boolean> {
    if (!this.canWriteImages()) return false;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  },
};
