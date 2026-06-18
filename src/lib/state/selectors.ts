import { useProjectStore, type SaveState } from './projectStore';
import { useWorkspaceStore } from './workspaceStore';
import { useSelectionStore } from './selectionStore';
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

/** The artboard the editor is focused on — driven by the selection store, with
 * a fallback to the first artboard when nothing is active yet. */
export function useActiveArtboard(): CalqoArtboard | null {
  const project = useActiveProject();
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  if (!project) return null;
  return (
    project.artboards.find((ab) => ab.id === activeArtboardId) ??
    project.artboards[0] ??
    null
  );
}
