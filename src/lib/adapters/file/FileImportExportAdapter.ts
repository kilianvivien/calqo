import type { CalqoProject } from '@/lib/schema';

/** The serialized `.calqo` envelope: the project document plus inlined assets
 * (data URLs) so a file is fully portable (plan §5.5). */
export interface CalqoFile {
  kind: 'calqo.project';
  formatVersion: 1;
  project: CalqoProject;
  assets: { id: string; name: string; mimeType: string; dataUrl: string }[];
}

export interface FileImportExportAdapter {
  importProjectFromFile(file: File): Promise<CalqoProject>;
  downloadBlob(blob: Blob, filename: string): Promise<void>;
}
