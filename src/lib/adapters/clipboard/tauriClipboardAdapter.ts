import type { ClipboardAdapter } from './ClipboardAdapter';

function canvasBlob(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export const tauriClipboardAdapter: ClipboardAdapter = {
  canWriteImages(): boolean {
    return true;
  },

  async writeImage(blob): Promise<boolean> {
    try {
      const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeImage(await blob.arrayBuffer());
      return true;
    } catch (error) {
      console.error('[Calqo] native image clipboard write failed', error);
      return false;
    }
  },

  async writeText(text): Promise<boolean> {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return true;
    } catch {
      return false;
    }
  },

  async readText(): Promise<string | null> {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      return await readText();
    } catch {
      return null;
    }
  },

  async readImage(): Promise<Blob | null> {
    try {
      const { readImage } = await import('@tauri-apps/plugin-clipboard-manager');
      const image = await readImage();
      const size = await image.size();
      return canvasBlob(await image.rgba(), size.width, size.height);
    } catch {
      return null;
    }
  },
};
