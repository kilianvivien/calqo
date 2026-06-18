import { files } from '@/lib/adapters';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { exportArtboardRaster, rasterFilename } from './rasterExport';

export type ShareOutcome = 'shared' | 'downloaded';

/** True when the browser can share files through the native share sheet
 * (Safari/macOS surfaces AirDrop here; Chrome Android too). */
export function canShareFiles(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function'
  );
}

/** Render the artboard to a PNG and hand it to the native share sheet. Falls
 * back to a normal download when file sharing is unavailable. */
export async function shareArtboardPng(
  project: CalqoProject,
  artboard: CalqoArtboard,
): Promise<ShareOutcome> {
  const blob = await exportArtboardRaster({
    artboard,
    locale: project.activeContentLocale,
    format: 'png',
    pixelRatio: 2,
    transparent: false,
  });
  const filename = rasterFilename(project.name, artboard.name, 'png', 2);
  const file = new File([blob], filename, { type: 'image/png' });

  if (canShareFiles() && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: project.name });
      return 'shared';
    } catch (error) {
      // User dismissed the share sheet — treat as a completed (no-op) share.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      throw error;
    }
  }

  await files.downloadBlob(blob, filename);
  return 'downloaded';
}
