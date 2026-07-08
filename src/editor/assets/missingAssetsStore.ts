import { create } from 'zustand';
import type { CalqoProject } from '@/lib/schema';
import { detectMissingAssets, type MissingAsset } from './missingAssets';

/** Shared missing-asset detection results per project, refreshed by the
 * workspace watcher and read by the status-bar badge, the export dialog, and
 * the repair modal. */
interface MissingAssetsState {
  byProject: Record<string, MissingAsset[]>;
  /** Project ids the automatic repair prompt has already fired for. */
  prompted: Record<string, boolean>;
  setForProject: (projectId: string, missing: MissingAsset[]) => void;
  markPrompted: (projectId: string) => void;
  clearProject: (projectId: string) => void;
}

export const useMissingAssetsStore = create<MissingAssetsState>((set) => ({
  byProject: {},
  prompted: {},
  setForProject: (projectId, missing) =>
    set((s) => ({ byProject: { ...s.byProject, [projectId]: missing } })),
  markPrompted: (projectId) =>
    set((s) => ({ prompted: { ...s.prompted, [projectId]: true } })),
  clearProject: (projectId) =>
    set((s) => {
      const byProject = { ...s.byProject };
      delete byProject[projectId];
      return { byProject };
    }),
}));

/** Re-run detection for a project and publish the result. */
export async function refreshMissingAssets(
  project: CalqoProject,
): Promise<MissingAsset[]> {
  const missing = await detectMissingAssets(project);
  useMissingAssetsStore.getState().setForProject(project.id, missing);
  return missing;
}
