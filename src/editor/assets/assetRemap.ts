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
/**
 * Rewrite every `assetId` / `storageKey` reference inside {@link value} through
 * {@link idMap}, mutating in place. This is the mutable sibling of
 * {@link remapProjectAssetIds} for use inside immer recipes (e.g. relinking a
 * missing asset as a single undoable edit). References without a mapping are
 * left untouched.
 */
export function rewriteAssetIdsInPlace(
  value: unknown,
  idMap: Map<string, string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => rewriteAssetIdsInPlace(entry, idMap));
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(record)) {
      if (
        (key === 'assetId' || key === 'storageKey') &&
        typeof val === 'string' &&
        idMap.has(val)
      ) {
        record[key] = idMap.get(val)!;
      } else {
        rewriteAssetIdsInPlace(val, idMap);
      }
    }
  }
}

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
