import { create } from 'zustand';
import type { CalqoProject } from '@/lib/schema';

const HISTORY_LIMIT = 80;

interface ProjectHistory {
  past: CalqoProject[];
  future: CalqoProject[];
}

interface HistoryState {
  histories: Record<string, ProjectHistory>;
  push: (projectId: string, snapshot: CalqoProject) => void;
  undo: (projectId: string, current: CalqoProject) => CalqoProject | null;
  redo: (projectId: string, current: CalqoProject) => CalqoProject | null;
  clear: (projectId: string) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  histories: {},
  push: (projectId, snapshot) => {
    const history = get().histories[projectId] ?? { past: [], future: [] };
    const past = [...history.past, structuredClone(snapshot)].slice(-HISTORY_LIMIT);
    set((state) => ({
      histories: {
        ...state.histories,
        [projectId]: { past, future: [] },
      },
    }));
  },
  undo: (projectId, current) => {
    const history = get().histories[projectId] ?? { past: [], future: [] };
    const previous = history.past.at(-1);
    if (!previous) return null;
    set((state) => ({
      histories: {
        ...state.histories,
        [projectId]: {
          past: history.past.slice(0, -1),
          future: [...history.future, structuredClone(current)],
        },
      },
    }));
    return structuredClone(previous);
  },
  redo: (projectId, current) => {
    const history = get().histories[projectId] ?? { past: [], future: [] };
    const next = history.future.at(-1);
    if (!next) return null;
    set((state) => ({
      histories: {
        ...state.histories,
        [projectId]: {
          past: [...history.past, structuredClone(current)].slice(-HISTORY_LIMIT),
          future: history.future.slice(0, -1),
        },
      },
    }));
    return structuredClone(next);
  },
  clear: (projectId) =>
    set((state) => {
      const histories = { ...state.histories };
      delete histories[projectId];
      return { histories };
    }),
}));

export const historyStore = useHistoryStore;
