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
  openProjectFileFromDisk?(): Promise<{ project: CalqoProject; path: string } | null>;
  saveTextFileToDisk?(text: string, options: NativeSaveOptions): Promise<string | null>;
  readTextFileFromDisk?(path: string): Promise<string>;
  writeTextFileToDisk?(path: string, text: string): Promise<void>;
  readBinaryFileFromDisk?(path: string): Promise<Uint8Array>;
  openImageFilesFromDisk?(): Promise<NativeBinaryFile[]>;
}

export interface NativeSaveOptions {
  defaultPath: string;
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface NativeBinaryFile {
  path: string;
  name: string;
  bytes: Uint8Array;
  mimeType: string;
}
