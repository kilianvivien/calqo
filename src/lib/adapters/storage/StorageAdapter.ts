import type { CalqoProject } from '@/lib/schema';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
}

/** Persistence boundary for project documents. The browser implementation uses
 * Dexie; a future Tauri implementation will use the filesystem. Editor code must
 * depend on this interface, never on Dexie directly (plan §0.3). */
export interface StorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<CalqoProject | null>;
  saveProject(project: CalqoProject): Promise<void>;
  deleteProject(id: string): Promise<void>;
}
