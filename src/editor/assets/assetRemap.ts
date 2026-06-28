import type { CalqoProject } from '@/lib/schema';

/**
 * Deep-copy a project, rewriting every asset reference through {@link idMap}.
 *
 * Assets are keyed globally by id but owned by a project (Dexie deletes a
 * project's assets by `projectId`), so any copy of a project — a duplicate or a
 * restored backup — must own *fresh* asset rows. This walks the document and
 * swaps `assetId` / `storageKey` references (layers, fills, backgrounds, list
 * markers) plus the `assets[]` manifest ids. References without a mapping are
 * left untouched so a project with a missing asset degrades the same way the
 * original would.
 */
export function remapProjectAssetIds(
  project: CalqoProject,
  idMap: Map<string, string>,
): CalqoProject {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (
          (key === 'assetId' || key === 'storageKey') &&
          typeof val === 'string' &&
          idMap.has(val)
        ) {
          out[key] = idMap.get(val)!;
        } else {
          out[key] = walk(val);
        }
      }
      return out;
    }
    return value;
  };

  const cloned = walk(project) as CalqoProject;
  cloned.assets = cloned.assets.map((ref) =>
    idMap.has(ref.id)
      ? { ...ref, id: idMap.get(ref.id)!, storageKey: idMap.get(ref.id)! }
      : ref,
  );
  return cloned;
}
