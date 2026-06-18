import { create } from 'zustand';

const WORKSPACE_KEY = 'calqo-workspace';

interface PersistedWorkspace {
  openTabIds: string[];
  activeProjectId: string | null;
}

function safeRead(): PersistedWorkspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) return JSON.parse(raw) as PersistedWorkspace;
  } catch {
    /* ignore */
  }
  return { openTabIds: [], activeProjectId: null };
}

function safeWrite(state: PersistedWorkspace): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

interface WorkspaceState {
  /** Ordered ids of projects open as tabs. */
  openTabIds: string[];
  activeProjectId: string | null;

  openTab: (id: string, activate?: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (from: number, to: number) => void;
  /** Replace tab state wholesale (used on startup hydration). */
  hydrate: (state: PersistedWorkspace) => void;
}

function persist(get: () => WorkspaceState): void {
  const { openTabIds, activeProjectId } = get();
  safeWrite({ openTabIds, activeProjectId });
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...safeRead(),

  openTab: (id, activate = true) => {
    set((s) => {
      const openTabIds = s.openTabIds.includes(id)
        ? s.openTabIds
        : [...s.openTabIds, id];
      return {
        openTabIds,
        activeProjectId: activate ? id : s.activeProjectId,
      };
    });
    persist(get);
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.openTabIds.indexOf(id);
      const openTabIds = s.openTabIds.filter((t) => t !== id);
      let activeProjectId = s.activeProjectId;
      if (activeProjectId === id) {
        // Activate the neighbour that slid into this slot, else the new last tab.
        activeProjectId = openTabIds[idx] ?? openTabIds[idx - 1] ?? null;
      }
      return { openTabIds, activeProjectId };
    });
    persist(get);
  },

  setActiveTab: (id) => {
    set({ activeProjectId: id });
    persist(get);
  },

  reorderTabs: (from, to) => {
    set((s) => {
      const openTabIds = [...s.openTabIds];
      const [moved] = openTabIds.splice(from, 1);
      if (moved !== undefined) openTabIds.splice(to, 0, moved);
      return { openTabIds };
    });
    persist(get);
  },

  hydrate: (state) => {
    set({ openTabIds: state.openTabIds, activeProjectId: state.activeProjectId });
    persist(get);
  },
}));

export const workspaceStore = useWorkspaceStore;
