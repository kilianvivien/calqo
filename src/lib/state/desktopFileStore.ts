import { create } from 'zustand';

export type DiskSaveState = 'unlinked' | 'saved' | 'unsaved' | 'saving' | 'error';

export interface DesktopFileMeta {
  path: string | null;
  diskState: DiskSaveState;
  lastSavedAt: string | null;
}

interface DesktopFileState {
  files: Record<string, DesktopFileMeta>;
  linkFile: (projectId: string, path: string, state?: DiskSaveState) => void;
  setDiskState: (projectId: string, state: DiskSaveState) => void;
  markUnsaved: (projectId: string) => void;
  clearFile: (projectId: string) => void;
}

export const useDesktopFileStore = create<DesktopFileState>((set) => ({
  files: {},

  linkFile: (projectId, path, diskState = 'saved') =>
    set((state) => ({
      files: {
        ...state.files,
        [projectId]: {
          path,
          diskState,
          lastSavedAt: diskState === 'saved' ? new Date().toISOString() : null,
        },
      },
    })),

  setDiskState: (projectId, diskState) =>
    set((state) => {
      const current = state.files[projectId] ?? {
        path: null,
        diskState: 'unlinked' as DiskSaveState,
        lastSavedAt: null,
      };
      return {
        files: {
          ...state.files,
          [projectId]: {
            ...current,
            diskState,
            lastSavedAt:
              diskState === 'saved' ? new Date().toISOString() : current.lastSavedAt,
          },
        },
      };
    }),

  markUnsaved: (projectId) =>
    set((state) => {
      const current = state.files[projectId];
      if (!current || current.diskState === 'unlinked') return state;
      return {
        files: {
          ...state.files,
          [projectId]: { ...current, diskState: 'unsaved' },
        },
      };
    }),

  clearFile: (projectId) =>
    set((state) => {
      const files = { ...state.files };
      delete files[projectId];
      return { files };
    }),
}));

export const desktopFileStore = useDesktopFileStore;

