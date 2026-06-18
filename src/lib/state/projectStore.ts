import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import type { CalqoProject } from '@/lib/schema';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface ProjectStoreState {
  /** Open project documents, normalized by id. */
  projects: Record<string, CalqoProject>;
  /** Per-project persistence status, surfaced in the status bar. */
  saveState: Record<string, SaveState>;

  upsertProject: (project: CalqoProject) => void;
  replaceProject: (project: CalqoProject, state?: SaveState) => void;
  /** Apply an immer mutation to a project and stamp `updatedAt`. */
  patchProject: (id: string, recipe: (draft: Draft<CalqoProject>) => void) => void;
  removeProject: (id: string) => void;
  setSaveState: (id: string, state: SaveState) => void;
}

export const useProjectStore = create<ProjectStoreState>()(
  immer((set) => ({
    projects: {},
    saveState: {},

    upsertProject: (project) =>
      set((s) => {
        s.projects[project.id] = project;
        if (!s.saveState[project.id]) s.saveState[project.id] = 'saved';
      }),

    replaceProject: (project, state = 'unsaved') =>
      set((s) => {
        s.projects[project.id] = project;
        s.saveState[project.id] = state;
      }),

    patchProject: (id, recipe) =>
      set((s) => {
        const project = s.projects[id];
        if (!project) return;
        recipe(project);
        project.updatedAt = new Date().toISOString();
        s.saveState[id] = 'unsaved';
      }),

    removeProject: (id) =>
      set((s) => {
        delete s.projects[id];
        delete s.saveState[id];
      }),

    setSaveState: (id, state) =>
      set((s) => {
        s.saveState[id] = state;
      }),
  })),
);

/** Non-reactive accessor for command modules. */
export const projectStore = useProjectStore;
