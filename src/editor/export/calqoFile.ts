import { assetStorage, files } from '@/lib/adapters';
import type { CalqoFile } from '@/lib/adapters';
import { safeImportProject, type CalqoProject } from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import { projectStore } from '@/lib/state/projectStore';
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

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/** Serialize a project and its assets into a portable `.calqo` envelope. */
export async function buildCalqoFile(project: CalqoProject): Promise<CalqoFile> {
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
  return {
    kind: 'calqo.project',
    formatVersion: 1,
    project,
    assets: assets.filter((a): a is NonNullable<typeof a> => a !== null),
  };
}

/** Export the active project to a downloaded `.calqo` JSON file. */
export async function exportProjectFile(projectId: string): Promise<void> {
  const project = projectStore.getState().projects[projectId];
  if (!project) return;
  const file = await buildCalqoFile(project);
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: 'application/json',
  });
  await files.downloadBlob(blob, `${slug(project.name)}.calqo`);
}

/** Parse, validate, and adopt a `.calqo` (or bare project) file. Assets are
 * restored to storage and the project is opened under a fresh id so an import
 * never clobbers an open document. */
export async function importProjectFile(file: File): Promise<string> {
  const text = await file.text();
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
    id: createId('proj'),
    createdAt: now,
    updatedAt: now,
  };

  // Restore inlined assets (if any) under their original ref ids.
  if (envelope?.assets?.length) {
    await Promise.all(
      envelope.assets.map(async (asset) => {
        const ref = project.assets.find((candidate) => candidate.id === asset.id);
        if (!ref) return;
        const blob = await dataUrlToBlob(asset.dataUrl);
        await assetStorage.restoreAsset(project.id, ref, blob);
      }),
    );
  }

  return adoptProject(project);
}
