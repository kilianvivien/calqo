import { safeImportProject, type CalqoProject } from '@/lib/schema';
import type {
  CalqoFile,
  FileImportExportAdapter,
} from './FileImportExportAdapter';

/** Trigger a browser download for an arbitrary blob via an object URL + anchor. */
function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve();
}

export const browserFileAdapter: FileImportExportAdapter = {
  async importProjectFromFile(file): Promise<CalqoProject> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('File is not valid JSON.');
    }
    // Accept either a bare project document or the `.calqo` envelope.
    const raw =
      parsed && typeof parsed === 'object' && 'kind' in parsed
        ? (parsed as CalqoFile).project
        : parsed;
    const result = safeImportProject(raw);
    if (!result.ok) {
      throw new Error(result.issues?.join('; ') ?? result.error);
    }
    return result.project;
  },

  downloadBlob,
};

export { downloadBlob };
