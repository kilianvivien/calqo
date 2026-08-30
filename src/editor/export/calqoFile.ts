import { DOCUMENT_LIMITS } from '@/lib/schema/budgets';
import { remapProjectAssetIds } from '@/editor/assets/assetRemap';
import { collectAssetUsage } from '@/editor/assets/missingAssets';
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

/** Filename-safe slug for downloaded `.calqo` files. */
export function slugifyFileName(value: string): string {
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
  if (
    typeof dataUrl !== 'string' ||
    dataUrl.length > Math.ceil((DOCUMENT_LIMITS.assetBytes * 4) / 3) + 256 ||
    !/^data:image\/(png|jpeg|webp|svg\+xml)(?:;charset=utf-8)?(?:;base64)?,/i.test(
      dataUrl,
    )
  ) {
    throw new Error(
      'Asset must be a bounded, embedded PNG, JPEG, WebP, or SVG.',
    );
  }
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.size > DOCUMENT_LIMITS.assetBytes)
    throw new Error('Asset exceeds the 32 MB limit.');
  return blob;
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
  await files.downloadBlob(blob, `${slugifyFileName(project.name)}.calqo`);
}

export async function importProjectText(
  text: string,
  options: { sourcePath?: string; preserveId?: boolean } = {},
): Promise<string> {
  if (new Blob([text]).size > DOCUMENT_LIMITS.fileBytes)
    throw new Error('Project file exceeds the 128 MB limit.');
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
  if (
    envelope &&
    (envelope.formatVersion !== 1 ||
      !Array.isArray(envelope.assets) ||
      envelope.assets.length > DOCUMENT_LIMITS.assets)
  ) {
    throw new Error('Unsupported or malformed project envelope.');
  }
  const rawProject = envelope ? envelope.project : parsed;

  const result = safeImportProject(rawProject);
  if (!result.ok) {
    throw new Error(result.issues?.join('; ') ?? result.error);
  }

  const now = new Date().toISOString();
  let project: CalqoProject = {
    ...result.project,
    id: options.preserveId ? result.project.id : createId('proj'),
    createdAt: options.preserveId ? result.project.createdAt : now,
    updatedAt: options.preserveId ? result.project.updatedAt : now,
  };

  // Validate/decode every inline asset before writes, then assign independent
  // ownership. Importing the same file twice must not overwrite another project.
  const prepared: { oldId: string; blob: Blob }[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const asset of envelope?.assets ?? []) {
    if (!asset || typeof asset.id !== 'string' || seen.has(asset.id))
      throw new Error('Malformed or duplicate asset entry.');
    seen.add(asset.id);
    const blob = await dataUrlToBlob(asset.dataUrl);
    totalBytes += blob.size;
    if (totalBytes > DOCUMENT_LIMITS.fileBytes)
      throw new Error('Project assets exceed the import budget.');
        const ref = project.assets.find((candidate) => candidate.id === asset.id);
    if (
      ref &&
      (blob.type !== ref.mimeType ||
        (ref.kind === 'svg') !== (blob.type === 'image/svg+xml'))
    )
      throw new Error('Embedded asset type does not match its manifest.');
    prepared.push({ oldId: asset.id, blob });
  }
  const idMap = new Map(
    [
      ...new Set([
        ...project.assets.map((asset) => asset.id),
        ...collectAssetUsage(project).keys(),
      ]),
    ].map((id) => [id, createId('asset')]),
  );
  project = remapProjectAssetIds(project, idMap);
  const restored: string[] = [];
  try {
    for (const { oldId, blob } of prepared) {
      const ref = project.assets.find(
        (candidate) => candidate.id === idMap.get(oldId),
      );
      if (!ref) continue;
        noticeIfOversized(ref.name, ref.kind, ref.width, ref.height);
        await assetStorage.restoreAsset(project.id, ref, blob);
      restored.push(ref.id);
    }
  } catch (error) {
    await Promise.allSettled(
      restored.map((id) => assetStorage.deleteAsset(id)),
    );
    throw error;
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
  if (file.size > DOCUMENT_LIMITS.fileBytes)
    throw new Error('Project file exceeds the 128 MB limit.');
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

async function saveNativeProjectFileOnce(
  projectId: string,
  mode: 'save' | 'saveAs' = 'save',
): Promise<string | null> {
  const project = projectStore.getState().projects[projectId];
  if (!project) return null;
  const meta = desktopFileStore.getState().files[projectId];
  const store = desktopFileStore.getState();
  try {
    store.setDiskState(projectId, 'saving');
    const text = await buildCalqoFileText(project);
    if (mode === 'save' && meta?.path && files.writeTextFileToDisk) {
      await files.writeTextFileToDisk(meta.path, text);
      store.linkFile(
        projectId,
        meta.path,
        projectStore.getState().projects[projectId] === project
          ? 'saved'
          : 'unsaved',
      );
      return meta.path;
    }
    const path = await files.saveTextFileToDisk?.(text, {
      defaultPath: `${slugifyFileName(project.name)}.calqo`,
      title: 'Save Calqo Project',
      filters: [{ name: 'Calqo Project', extensions: ['calqo'] }],
    });
    if (path)
      store.linkFile(
        projectId,
        path,
        projectStore.getState().projects[projectId] === project
          ? 'saved'
          : 'unsaved',
      );
    else
      store.setDiskState(
        projectId,
        meta?.path
          ? projectStore.getState().projects[projectId] === project
            ? meta.diskState
            : 'unsaved'
          : 'unlinked',
      );
    return path ?? null;
  } catch (error) {
    console.error('[Calqo] native project save failed', error);
    store.setDiskState(projectId, 'error');
    return null;
  }
}

const nativeSaves = new Map<string, Promise<string | null>>();

/** Disk writes and Save As dialogs run sequentially for each document. */
export function saveNativeProjectFile(
  projectId: string,
  mode: 'save' | 'saveAs' = 'save',
): Promise<string | null> {
  const previous = nativeSaves.get(projectId) ?? Promise.resolve(null);
  const task = previous
    .catch(() => null)
    .then(() => saveNativeProjectFileOnce(projectId, mode))
    .finally(() => {
      if (nativeSaves.get(projectId) === task) nativeSaves.delete(projectId);
    });
  nativeSaves.set(projectId, task);
  return task;
}
