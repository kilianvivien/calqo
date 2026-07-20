import { assetStorage, files, storage } from '@/lib/adapters';
import type { CalqoFile } from '@/lib/adapters';
import {
  safeImportProject,
  toV1CompatibleDocument,
  type CalqoProject,
} from '@/lib/schema';
import { noticeIfOversized } from '@/lib/utils/imageAsset';
import { createId } from '@/lib/utils/ids';
import { projectStore } from '@/lib/state/projectStore';
import { desktopFileStore } from '@/lib/state/desktopFileStore';
import { adoptProject } from '@/editor/commands/projectCommands';

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'calqo'
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read asset blob.'));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function collectEnvelopeAssets(project: CalqoProject) {
  const assets = await Promise.all(
    project.assets.map(async (ref) => {
      const blob = await assetStorage.getAssetBlob(ref.id);
      return blob
        ? {
            id: ref.id,
            name: ref.name,
            mimeType: ref.mimeType,
            dataUrl: await blobToDataUrl(blob),
          }
        : null;
    }),
  );
  return assets.filter((a): a is NonNullable<typeof a> => a !== null);
}

/** Serialize a project and its assets into a portable `.calqo` envelope. */
export async function buildCalqoFile(project: CalqoProject): Promise<CalqoFile> {
  return {
    kind: 'calqo.project',
    formatVersion: 1,
    project,
    assets: await collectEnvelopeAssets(project),
  };
}

export async function buildCalqoFileText(project: CalqoProject): Promise<string> {
  return JSON.stringify(await buildCalqoFile(project), null, 2);
}

/** Serialize a project as a v1-compatible (`schemaVersion: 1`) envelope so it
 * opens in older Calqo builds. Returns `null` when the project carries
 * animation/timing/clip settings a v1 client cannot represent — the caller then
 * offers only the current-format export (§4.4). The envelope `formatVersion`
 * (transport) stays independent of the project `schemaVersion` (document). */
export async function buildV1CompatibleCalqoFileText(
  project: CalqoProject,
): Promise<string | null> {
  const downgraded = toV1CompatibleDocument(project);
  if (!downgraded) return null;
  const envelope = {
    kind: 'calqo.project' as const,
    formatVersion: 1 as const,
    project: downgraded,
    assets: await collectEnvelopeAssets(project),
  };
  return JSON.stringify(envelope, null, 2);
}

/** Export a project to a downloaded `.calqo` JSON file. Works for an open
 * document or one that only lives in storage (project-manager rows). */
export async function exportProjectFile(projectId: string): Promise<void> {
  const project =
    projectStore.getState().projects[projectId] ??
    (await storage.getProject(projectId));
  if (!project) return;
  const blob = new Blob([await buildCalqoFileText(project)], {
    type: 'application/json',
  });
  await files.downloadBlob(blob, `${slug(project.name)}.calqo`);
}

export async function importProjectText(
  text: string,
  options: { sourcePath?: string; preserveId?: boolean } = {},
): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  const envelope =
    parsed && typeof parsed === 'object' && (parsed as CalqoFile).kind === 'calqo.project'
      ? (parsed as CalqoFile)
      : null;
  const rawProject = envelope ? envelope.project : parsed;

  const result = safeImportProject(rawProject);
  if (!result.ok) {
    throw new Error(result.issues?.join('; ') ?? result.error);
  }

  const now = new Date().toISOString();
  const project: CalqoProject = {
    ...result.project,
    id: options.preserveId ? result.project.id : createId('proj'),
    createdAt: options.preserveId ? result.project.createdAt : now,
    updatedAt: options.preserveId ? result.project.updatedAt : now,
  };

  // Restore inlined assets (if any) under their original ref ids.
  if (envelope?.assets?.length) {
    await Promise.all(
      envelope.assets.map(async (asset) => {
        const ref = project.assets.find((candidate) => candidate.id === asset.id);
        if (!ref) return;
        noticeIfOversized(ref.name, ref.kind, ref.width, ref.height);
        const blob = await dataUrlToBlob(asset.dataUrl);
        await assetStorage.restoreAsset(project.id, ref, blob);
      }),
    );
  }

  const id = await adoptProject(project);
  if (options.sourcePath) {
    desktopFileStore.getState().linkFile(id, options.sourcePath, 'saved');
  }
  return id;
}

/** Parse, validate, and adopt a `.calqo` (or bare project) file. Assets are
 * restored to storage and the project is opened under a fresh id so an import
 * never clobbers an open document. */
export async function importProjectFile(file: File): Promise<string> {
  return importProjectText(await file.text());
}

export async function openNativeProjectFile(): Promise<string | null> {
  const opened = await files.openProjectFileFromDisk?.();
  if (!opened) return null;
  const text = files.readTextFileFromDisk
    ? await files.readTextFileFromDisk(opened.path)
    : JSON.stringify(opened.project);
  return importProjectText(text, {
    sourcePath: opened.path,
  });
}

export async function saveNativeProjectFile(
  projectId: string,
  mode: 'save' | 'saveAs' = 'save',
): Promise<string | null> {
  const project = projectStore.getState().projects[projectId];
  if (!project) return null;
  const text = await buildCalqoFileText(project);
  const meta = desktopFileStore.getState().files[projectId];
  const store = desktopFileStore.getState();
  try {
    store.setDiskState(projectId, 'saving');
    if (mode === 'save' && meta?.path && files.writeTextFileToDisk) {
      await files.writeTextFileToDisk(meta.path, text);
      store.linkFile(projectId, meta.path, 'saved');
      return meta.path;
    }
    const path = await files.saveTextFileToDisk?.(text, {
      defaultPath: `${slug(project.name)}.calqo`,
      title: 'Save Calqo Project',
      filters: [{ name: 'Calqo Project', extensions: ['calqo'] }],
    });
    if (path) store.linkFile(projectId, path, 'saved');
    else store.setDiskState(projectId, meta?.path ? meta.diskState : 'unlinked');
    return path ?? null;
  } catch (error) {
    console.error('[Calqo] native project save failed', error);
    store.setDiskState(projectId, 'error');
    return null;
  }
}
