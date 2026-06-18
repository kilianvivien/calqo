import { create } from 'zustand';

interface SelectionState {
  activeArtboardId: string | null;
  selectedLayerIds: string[];
  hoveredLayerId: string | null;
  setActiveArtboard: (id: string | null) => void;
  setSelection: (ids: string[]) => void;
  selectOne: (id: string | null) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setHoveredLayer: (id: string | null) => void;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  activeArtboardId: null,
  selectedLayerIds: [],
  hoveredLayerId: null,
  setActiveArtboard: (activeArtboardId) => set({ activeArtboardId }),
  setSelection: (ids) => set({ selectedLayerIds: unique(ids) }),
  selectOne: (id) => set({ selectedLayerIds: id ? [id] : [] }),
  toggleSelection: (id) => {
    const selected = get().selectedLayerIds;
    set({
      selectedLayerIds: selected.includes(id)
        ? selected.filter((existing) => existing !== id)
        : [...selected, id],
    });
  },
  clearSelection: () => set({ selectedLayerIds: [] }),
  setHoveredLayer: (hoveredLayerId) => set({ hoveredLayerId }),
}));

export const selectionStore = useSelectionStore;
