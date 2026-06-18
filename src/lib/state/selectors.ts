import { useProjectStore, type SaveState } from './projectStore';
import { useWorkspaceStore } from './workspaceStore';
import type { CalqoProject, CalqoArtboard } from '@/lib/schema';

/** The project document backing the active tab, or null when none is open. */
export function useActiveProject(): CalqoProject | null {
  const activeId = useWorkspaceStore((s) => s.activeProjectId);
  return useProjectStore((s) => (activeId ? (s.projects[activeId] ?? null) : null));
}

/** Save-state of the active project for the status bar. */
export function useActiveSaveState(): SaveState | null {
  const activeId = useWorkspaceStore((s) => s.activeProjectId);
  return useProjectStore((s) => (activeId ? (s.saveState[activeId] ?? null) : null));
}

/** The first artboard of the active project (the only one shown until Phase C). */
export function useActiveArtboard(): CalqoArtboard | null {
  const project = useActiveProject();
  return project?.artboards[0] ?? null;
}
