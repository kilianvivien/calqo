import { nanoid } from 'nanoid';

/** Stable, collision-resistant id for projects, artboards, layers, and assets. */
export function createId(prefix = ''): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}
