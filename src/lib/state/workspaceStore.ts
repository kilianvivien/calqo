import { create } from 'zustand';

const WORKSPACE_KEY = 'calqo-workspace';

/** Per-project editing surface. Design is the static editor; Animate is the
 * preset animation authoring mode (docs/calqo-animation-extension-plan.md §6.1).
 * Mode is a workspace preference keyed by project id — never project data — so it
 * cannot leak across projects (a global mode field would). */
export type WorkspaceMode = 'design' | 'animate';

interface PersistedWorkspace {
  openTabIds: string[];
  activeProjectId: string | null;
  /** Editing mode per project id. Absent ids default to Design. */
  modeByProject?: Record<string, WorkspaceMode>;
}

function safeRead(): PersistedWorkspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) return JSON.parse(raw) as PersistedWorkspace;
  } catch {
    /* ignore */
  }
  return { openTabIds: [], activeProjectId: null, modeByProject: {} };
}

function safeWrite(state: PersistedWorkspace): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Drop mode entries for projects that are no longer open, so the map cannot
 * grow without bound across sessions. */
function pruneModes(
  modeByProject: Record<string, WorkspaceMode>,
  openTabIds: string[],
): Record<string, WorkspaceMode> {
  const open = new Set(openTabIds);
  const next: Record<string, WorkspaceMode> = {};
  for (const [id, mode] of Object.entries(modeByProject)) {
    if (open.has(id)) next[id] = mode;
  }
  return next;
}

interface WorkspaceState {
  /** Ordered ids of projects open as tabs. */
  openTabIds: string[];
  activeProjectId: string | null;
  /** Editing mode per project id; missing ids are Design. */
  modeByProject: Record<string, WorkspaceMode>;

  openTab: (id: string, activate?: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (from: number, to: number) => void;
  setMode: (id: string, mode: WorkspaceMode) => void;
  /** Replace tab state wholesale (used on startup hydration). */
  hydrate: (state: PersistedWorkspace) => void;
}

function persist(get: () => WorkspaceState): void {
  const { openTabIds, activeProjectId, modeByProject } = get();
  safeWrite({ openTabIds, activeProjectId, modeByProject });
}

const initial = safeRead();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  openTabIds: initial.openTabIds,
  activeProjectId: initial.activeProjectId,
  modeByProject: pruneModes(initial.modeByProject ?? {}, initial.openTabIds),

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
      const modeByProject = pruneModes(s.modeByProject, openTabIds);
      return { openTabIds, activeProjectId, modeByProject };
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

  setMode: (id, mode) => {
    set((s) => ({ modeByProject: { ...s.modeByProject, [id]: mode } }));
    persist(get);
  },

  hydrate: (state) => {
    const modeByProject = pruneModes(state.modeByProject ?? {}, state.openTabIds);
    set({
      openTabIds: state.openTabIds,
      activeProjectId: state.activeProjectId,
      modeByProject,
    });
    persist(get);
  },
}));

export const workspaceStore = useWorkspaceStore;

/** Mode for a project id (Design when unset). */
export function workspaceModeFor(id: string | null): WorkspaceMode {
  if (!id) return 'design';
  return useWorkspaceStore.getState().modeByProject[id] ?? 'design';
}
