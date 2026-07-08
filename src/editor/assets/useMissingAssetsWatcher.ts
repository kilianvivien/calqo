import { useEffect, useMemo, useRef } from 'react';
import { useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';
import { collectAssetUsage } from './missingAssets';
import {
  refreshMissingAssets,
  useMissingAssetsStore,
} from './missingAssetsStore';

/**
 * Watch the active project for broken asset references. Detection re-runs only
 * when the set of referenced/manifest asset ids changes (not on every edit),
 * covering the project-open and `.calqo`-import paths. The first time a project
 * shows missing assets, the repair modal opens automatically — dismissable,
 * never blocking.
 */
export function useMissingAssetsWatcher(): void {
  const project = useActiveProject();
  const setRepairAssetsOpen = useUiStore((s) => s.setRepairAssetsOpen);
  const projectRef = useRef(project);
  projectRef.current = project;

  const signature = useMemo(() => {
    if (!project) return '';
    const referenced = [...collectAssetUsage(project).keys()].sort().join('|');
    const manifest = project.assets.map((ref) => ref.id).sort().join('|');
    return `${project.id}#${referenced}#${manifest}`;
  }, [project]);

  useEffect(() => {
    const current = projectRef.current;
    if (!current) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      void refreshMissingAssets(current).then((missing) => {
        if (!alive) return;
        const store = useMissingAssetsStore.getState();
        if (missing.length > 0 && !store.prompted[current.id]) {
          store.markPrompted(current.id);
          setRepairAssetsOpen(true);
        }
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [signature, setRepairAssetsOpen]);
}
