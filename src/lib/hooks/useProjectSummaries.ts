import { useCallback, useEffect, useState } from 'react';
import { storage, type ProjectSummary } from '@/lib/adapters';
import { useProjectStore } from '@/lib/state/projectStore';

interface ProjectSummariesResult {
  /** `null` while the first listing is still loading. */
  summaries: ProjectSummary[] | null;
  refresh: () => void;
}

/** Lists locally stored projects through the storage adapter and re-lists when
 * save state changes (a fresh save, delete, or import). Shared by the mobile
 * project browser and the desktop project manager. */
export function useProjectSummaries(enabled = true): ProjectSummariesResult {
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);
  // Re-list whenever any open project's persistence status changes.
  const saveTick = useProjectStore((s) => Object.values(s.saveState).join(','));

  const refresh = useCallback(() => {
    void storage
      .listProjects()
      .then(setSummaries)
      .catch(() => setSummaries([]));
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh, saveTick]);

  return { summaries, refresh };
}
