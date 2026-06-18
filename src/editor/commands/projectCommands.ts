import type { Draft } from 'immer';
import { storage } from '@/lib/adapters';
import {
  createDefaultProject,
  type CalqoProject,
  type CreateProjectOptions,
} from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import { projectStore } from '@/lib/state/projectStore';
import { workspaceStore } from '@/lib/state/workspaceStore';

const AUTOSAVE_DELAY = 700;
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

/** Persist a project now, updating its save-state through the lifecycle. */
export async function saveProject(id: string): Promise<void> {
  const timer = pendingSaves.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingSaves.delete(id);
  }
  const project = projectStore.getState().projects[id];
  if (!project) return;

  projectStore.getState().setSaveState(id, 'saving');
  try {
    await storage.saveProject(project);
    projectStore.getState().setSaveState(id, 'saved');
  } catch (err) {
    console.error('[Calqo] save failed', err);
    projectStore.getState().setSaveState(id, 'error');
  }
}

/** Debounced autosave; coalesces rapid edits into one write. */
function scheduleAutosave(id: string): void {
  const existing = pendingSaves.get(id);
  if (existing) clearTimeout(existing);
  pendingSaves.set(
    id,
    setTimeout(() => {
      void saveProject(id);
    }, AUTOSAVE_DELAY),
  );
}

/** The single mutation entry point: apply an immer change, then autosave. */
export function editProject(
  id: string,
  recipe: (draft: Draft<CalqoProject>) => void,
): void {
  projectStore.getState().patchProject(id, recipe);
  scheduleAutosave(id);
}

/** Create a fresh project, persist it, and open it in a new active tab. */
export async function createProject(
  options?: CreateProjectOptions,
): Promise<string> {
  const project = createDefaultProject(options);
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  await saveProject(project.id);
  return project.id;
}

/** Adopt an externally produced document (import / AI) into the workspace. */
export async function adoptProject(project: CalqoProject): Promise<string> {
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(project.id, true);
  await saveProject(project.id);
  return project.id;
}

export function renameProject(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  editProject(id, (draft) => {
    draft.name = trimmed;
  });
}

/** Deep-copy a project under a new id and open it. Assets are shared by id for
 * now (no images until Phase B); asset duplication lands with the image layer. */
export async function duplicateProject(id: string): Promise<string | null> {
  const source = projectStore.getState().projects[id];
  if (!source) return null;
  const now = new Date().toISOString();
  const copy: CalqoProject = {
    ...structuredClone(source),
    id: createId('proj'),
    name: `${source.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
  projectStore.getState().upsertProject(copy);
  workspaceStore.getState().openTab(copy.id, true);
  await saveProject(copy.id);
  return copy.id;
}

/** Load a saved project into the workspace (or just focus it if already open). */
export async function openProject(id: string): Promise<void> {
  const inMemory = projectStore.getState().projects[id];
  if (inMemory) {
    workspaceStore.getState().openTab(id, true);
    return;
  }
  const project = await storage.getProject(id);
  if (!project) return;
  projectStore.getState().upsertProject(project);
  workspaceStore.getState().openTab(id, true);
}

/** Close a tab, flushing any pending save first so nothing is lost. */
export async function closeProject(id: string): Promise<void> {
  await saveProject(id);
  workspaceStore.getState().closeTab(id);
  projectStore.getState().removeProject(id);
}

/** Permanently delete a project from storage and the workspace. */
export async function deleteProject(id: string): Promise<void> {
  await storage.deleteProject(id);
  workspaceStore.getState().closeTab(id);
  projectStore.getState().removeProject(id);
}

/** Flush all pending autosaves immediately (e.g. on page unload). */
export async function flushPendingSaves(): Promise<void> {
  await Promise.all([...pendingSaves.keys()].map((id) => saveProject(id)));
}

/** On startup, reopen the tabs that were open last session by loading their
 * documents from storage; silently drop any that no longer exist. */
export async function hydrateWorkspace(): Promise<void> {
  const { openTabIds, activeProjectId } = workspaceStore.getState();
  if (openTabIds.length === 0) return;

  const loaded: string[] = [];
  for (const id of openTabIds) {
    try {
      const project = await storage.getProject(id);
      if (project) {
        projectStore.getState().upsertProject(project);
        loaded.push(id);
      }
    } catch (err) {
      console.error(`[Calqo] failed to load project ${id}`, err);
    }
  }

  const nextActive =
    activeProjectId && loaded.includes(activeProjectId)
      ? activeProjectId
      : (loaded[0] ?? null);
  workspaceStore.getState().hydrate({
    openTabIds: loaded,
    activeProjectId: nextActive,
  });
}
