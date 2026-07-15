import { assetStorage, starterLibrary, storage } from '@/lib/adapters';
import type { CalqoFile, StarterRecord } from '@/lib/adapters';
import { safeImportProject, type CalqoProject } from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import { projectStore } from '@/lib/state/projectStore';
import { remapProjectAssetIds } from '@/editor/assets/assetRemap';
import { buildCalqoFile, dataUrlToBlob } from '@/editor/export/calqoFile';
import { adoptProject } from '@/editor/commands/projectCommands';
import { exportArtboardRaster } from '@/editor/export/rasterExport';
import { downscaleImageBlob } from '@/editor/assets/assetHealth';

/** One entry of `public/starters/index.json` — the bundled starter catalogue. */
export interface StarterIndexEntry {
  id: string;
  /** Display name (starters are authored in English; the project itself may be
   * multilingual). */
  name: string;
  /** `.calqo` filename inside `public/starters/`. */
  file: string;
  /** Preset tags for the gallery card (e.g. "ig-square", "multilingual"). */
  tags: string[];
  /** Pre-rendered local gallery thumbnail. */
  thumbnail: string;
  /** Primary artboard dimensions displayed on the card. */
  width: number;
  height: number;
  /** Presets represented by the starter (multi-artboard starters may list many). */
  presets: string[];
}

const STARTERS_BASE = '/starters';
const THUMBNAIL_EDGE = 320;

/** Fetch the bundled starter catalogue. Fails soft: an empty list when the
 * index is unreachable, so the gallery degrades instead of crashing. */
export async function fetchBundledStarterIndex(): Promise<StarterIndexEntry[]> {
  try {
    const response = await fetch(`${STARTERS_BASE}/index.json`);
    if (!response.ok) return [];
    const parsed = (await response.json()) as { starters?: StarterIndexEntry[] };
    return Array.isArray(parsed.starters) ? parsed.starters : [];
  } catch {
    return [];
  }
}

/** Fetch and parse one bundled starter envelope. Returns null when the file is
 * unreachable or not JSON — validation happens at instantiation. */
export async function loadBundledStarterEnvelope(
  entry: StarterIndexEntry,
): Promise<CalqoFile | null> {
  try {
    const response = await fetch(`${STARTERS_BASE}/${entry.file}`);
    if (!response.ok) return null;
    return (await response.json()) as CalqoFile;
  } catch {
    return null;
  }
}

/**
 * Clone a starter envelope into a fresh, independent project and open it:
 * validated through `safeImportProject`, asset blobs cloned under fresh ids,
 * every reference rewritten via `remapProjectAssetIds` (the same contract
 * project copies follow), and a new project id/timestamps. The source starter
 * is never mutated and never shares asset ids or blobs with the new project.
 */
export async function createProjectFromStarter(
  envelope: CalqoFile | { project: unknown },
  options: { name?: string } = {},
): Promise<string> {
  const result = safeImportProject(envelope.project);
  if (!result.ok) {
    throw new Error(result.issues?.join('; ') ?? result.error);
  }

  const newProjectId = createId('proj');
  const idMap = new Map<string, string>();
  const inlineAssets =
    'assets' in envelope && Array.isArray(envelope.assets) ? envelope.assets : [];
  for (const asset of inlineAssets) {
    const ref = result.project.assets.find((candidate) => candidate.id === asset.id);
    if (!ref) continue;
    const blob = await dataUrlToBlob(asset.dataUrl);
    const newRef = await assetStorage.saveAsset(newProjectId, blob, {
      name: ref.name,
      mimeType: ref.mimeType,
      kind: ref.kind,
      width: ref.width,
      height: ref.height,
    });
    idMap.set(ref.id, newRef.id);
  }

  const now = new Date().toISOString();
  const project: CalqoProject = {
    ...remapProjectAssetIds(result.project, idMap),
    id: newProjectId,
    name: options.name ?? result.project.name,
    createdAt: now,
    updatedAt: now,
  };
  return adoptProject(project);
}

/** Render a small PNG thumbnail data URL of a project's first artboard. Fails
 * soft (undefined) where no canvas is available. */
async function renderStarterThumbnail(
  project: CalqoProject,
): Promise<string | undefined> {
  const artboard = project.artboards[0];
  if (!artboard) return undefined;
  try {
    const png = await exportArtboardRaster({
      artboard,
      locale: project.activeContentLocale,
      format: 'png',
      pixelRatio: 1,
      transparent: false,
    });
    const small = await downscaleImageBlob(png, THUMBNAIL_EDGE, 'image/png');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Thumbnail encode failed.'));
      reader.readAsDataURL(small.blob);
    });
  } catch {
    return undefined;
  }
}

/** Snapshot a project (open or stored) into the local user-starter library via
 * the existing `.calqo` serialization, with a pre-rendered thumbnail. */
export async function saveProjectAsStarter(
  projectId: string,
  name?: string,
): Promise<StarterRecord | null> {
  const project =
    projectStore.getState().projects[projectId] ??
    (await storage.getProject(projectId));
  if (!project) return null;
  const envelope = await buildCalqoFile(project);
  const now = new Date().toISOString();
  const record: StarterRecord = {
    id: createId('starter'),
    name: (name ?? project.name).trim() || project.name,
    createdAt: now,
    updatedAt: now,
    envelope,
    thumbnail: await renderStarterThumbnail(project),
  };
  await starterLibrary.saveStarter(record);
  return record;
}

export async function listUserStarters(): Promise<StarterRecord[]> {
  return starterLibrary.listStarters();
}

export async function renameUserStarter(id: string, name: string): Promise<void> {
  await starterLibrary.renameStarter(id, name);
}

export async function deleteUserStarter(id: string): Promise<void> {
  await starterLibrary.deleteStarter(id);
}
