import { db } from '@/lib/db/dexie';
import { safeImportProject, type CalqoProject } from '@/lib/schema';
import type { ProjectSummary, StorageAdapter } from './StorageAdapter';

export const dexieStorageAdapter: StorageAdapter = {
  async listProjects(): Promise<ProjectSummary[]> {
    const records = await db.projects.orderBy('updatedAt').reverse().toArray();
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }));
  },

  async getProject(id): Promise<CalqoProject | null> {
    const record = await db.projects.get(id);
    if (!record) return null;
    // Validate/migrate on read so a stale or hand-edited record can't poison the
    // running app; a hard failure surfaces rather than silently corrupting state.
    const result = safeImportProject(record.project);
    if (!result.ok) {
      throw new Error(
        `Stored project ${id} is invalid: ${result.issues?.join('; ') ?? result.error}`,
      );
    }
    return result.project;
  },

  async saveProject(project): Promise<void> {
    await db.projects.put({
      id: project.id,
      name: project.name,
      schemaVersion: project.schemaVersion,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
      project,
    });
  },

  async deleteProject(id): Promise<void> {
    await db.transaction('rw', db.projects, db.assets, async () => {
      await db.projects.delete(id);
      await db.assets.where('projectId').equals(id).delete();
    });
  },
};
