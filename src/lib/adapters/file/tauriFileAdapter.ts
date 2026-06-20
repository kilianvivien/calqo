import { safeImportProject, type CalqoProject } from '@/lib/schema';
import type {
  FileImportExportAdapter,
  NativeBinaryFile,
  NativeSaveOptions,
} from './FileImportExportAdapter';
import { browserFileAdapter } from './browserFileAdapter';

type DialogModule = typeof import('@tauri-apps/plugin-dialog');
type FsModule = typeof import('@tauri-apps/plugin-fs');

const calqoFilter = [{ name: 'Calqo Project', extensions: ['calqo', 'json'] }];
const imageFilter = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] },
];

function filename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

function parseProject(text: string): CalqoProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const raw =
    parsed && typeof parsed === 'object' && 'kind' in parsed
      ? (parsed as { project?: unknown }).project
      : parsed;
  const result = safeImportProject(raw);
  if (!result.ok) throw new Error(result.issues?.join('; ') ?? result.error);
  return result.project;
}

async function dialog(): Promise<DialogModule> {
  return import('@tauri-apps/plugin-dialog');
}

async function fs(): Promise<FsModule> {
  return import('@tauri-apps/plugin-fs');
}

async function openPath(): Promise<string | null> {
  const { open } = await dialog();
  const selected = await open({
    title: 'Open Calqo Project',
    filters: calqoFilter,
    multiple: false,
    fileAccessMode: 'scoped',
  });
  return typeof selected === 'string' ? selected : null;
}

export const tauriFileAdapter: FileImportExportAdapter = {
  importProjectFromFile: browserFileAdapter.importProjectFromFile,

  async downloadBlob(blob, name): Promise<void> {
    const { save } = await dialog();
    const path = await save({
      title: 'Save File',
      defaultPath: name,
      filters: [{ name: 'File', extensions: [name.split('.').pop() ?? 'txt'] }],
    });
    if (!path) return;
    const { writeFile } = await fs();
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  },

  async openProjectFileFromDisk() {
    const path = await openPath();
    if (!path) return null;
    const text = await this.readTextFileFromDisk?.(path);
    if (!text) return null;
    return { project: parseProject(text), path };
  },

  async saveTextFileToDisk(text: string, options: NativeSaveOptions) {
    const { save } = await dialog();
    const path = await save({
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters ?? calqoFilter,
      canCreateDirectories: true,
    });
    if (!path) return null;
    await this.writeTextFileToDisk?.(path, text);
    return path;
  },

  async readTextFileFromDisk(path) {
    const { readTextFile } = await fs();
    return readTextFile(path);
  },

  async writeTextFileToDisk(path, text) {
    const { writeTextFile } = await fs();
    await writeTextFile(path, text);
  },

  async readBinaryFileFromDisk(path) {
    const { readFile } = await fs();
    return readFile(path);
  },

  async openImageFilesFromDisk(): Promise<NativeBinaryFile[]> {
    const { open } = await dialog();
    const selected = await open({
      title: 'Open Image',
      filters: imageFilter,
      multiple: true,
      fileAccessMode: 'scoped',
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    const { readFile } = await fs();
    return Promise.all(
      paths.map(async (path) => ({
        path,
        name: filename(path),
        bytes: await readFile(path),
        mimeType: mimeFromPath(path),
      })),
    );
  },
};
