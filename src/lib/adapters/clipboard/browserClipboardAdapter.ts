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

  async writeText(text): Promise<boolean> {
    if (
      typeof navigator === 'undefined' ||
      !('clipboard' in navigator) ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },

  async readText(): Promise<string | null> {
    if (
      typeof navigator === 'undefined' ||
      !('clipboard' in navigator) ||
      typeof navigator.clipboard.readText !== 'function'
    ) {
      return null;
    }
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  },
};
