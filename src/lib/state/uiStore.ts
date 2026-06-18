import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';
export type TransparencyMode = 'auto' | 'glass' | 'solid';
export type EditorTool =
  | 'select'
  | 'pan'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'svg';

export interface CanvasGuide {
  axis: 'x' | 'y';
  position: number;
}

const THEME_KEY = 'calqo-theme';
const TRANSPARENCY_KEY = 'calqo-transparency';

/** localStorage can throw in sandboxed/locked-down contexts — never let that
 * break a click handler. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function resolveInitialTheme(): ThemeMode {
  const saved = safeGet(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

function resolveInitialTransparency(): TransparencyMode {
  const saved = safeGet(TRANSPARENCY_KEY);
  if (saved === 'auto' || saved === 'glass' || saved === 'solid') return saved;
  return 'auto';
}

/** Reflect UI chrome preferences onto the document so CSS variables and the
 * reduced-transparency rules can react. */
export function applyUiAttributes(
  theme: ThemeMode,
  transparency: TransparencyMode,
): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-transparency', transparency);
}

interface UiState {
  theme: ThemeMode;
  transparency: TransparencyMode;
  activeTool: EditorTool;
  zoom: number;
  pan: { x: number; y: number };
  snapEnabled: boolean;
  guides: CanvasGuide[];
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setTransparency: (mode: TransparencyMode) => void;
  setActiveTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGuides: (guides: CanvasGuide[]) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: resolveInitialTheme(),
  transparency: resolveInitialTransparency(),
  activeTool: 'select',
  zoom: 1,
  pan: { x: 0, y: 0 },
  snapEnabled: true,
  guides: [],
  setTheme: (theme) => {
    safeSet(THEME_KEY, theme);
    applyUiAttributes(theme, get().transparency);
    set({ theme });
  },
  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },
  setTransparency: (transparency) => {
    safeSet(TRANSPARENCY_KEY, transparency);
    applyUiAttributes(get().theme, transparency);
    set({ transparency });
  },
  setActiveTool: (activeTool) => set({ activeTool }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.05, zoom)) }),
  setPan: (pan) => set({ pan }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setGuides: (guides) => set({ guides }),
}));
