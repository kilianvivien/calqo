import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';
export type TransparencyMode = 'auto' | 'glass' | 'solid';
export type EditorTool =
  | 'select'
  | 'marquee'
  | 'pan'
  | 'text'
  | 'list'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'triangle'
  | 'diamond'
  | 'badge'
  | 'star'
  | 'pen'
  | 'brush'
  | 'image'
  | 'svg'
  | 'emoji';

export interface CanvasGuide {
  axis: 'x' | 'y';
  position: number;
}

/** Which AI dialog is open. Held in the UI store so both the title bar and the
 * inspector can trigger them without prop drilling. */
export type AiDialog = 'none' | 'template' | 'translate';

/** Brush feel for the freehand tool. */
export type BrushStyle =
  | 'smooth'
  | 'marker'
  | 'highlighter'
  | 'dashed'
  | 'felt-tip'
  | 'marker-underline'
  | 'glow-pen'
  | 'chalk'
  | 'crayon';

/** Soft limits driving asset-health warnings (import + export). Power users
 * can raise them at runtime; they are app preferences, not project data. */
export interface AssetHealthThresholds {
  /** Decoded (RGBA) size above which a single raster asset is flagged. */
  maxAssetDecodedBytes: number;
  /** Long-edge pixel count above which a single raster asset is flagged. */
  maxAssetEdge: number;
  /** Estimated `.calqo` envelope size above which export warns. */
  maxEnvelopeBytes: number;
}

export const DEFAULT_ASSET_HEALTH_THRESHOLDS: AssetHealthThresholds = {
  maxAssetDecodedBytes: 8 * 1024 * 1024,
  maxAssetEdge: 4096,
  maxEnvelopeBytes: 50 * 1024 * 1024,
};

/** Non-blocking notice raised when an oversized raster asset is imported. */
export interface AssetHealthNotice {
  name: string;
  width?: number;
  height?: number;
}

/** Brand-profile font defaults applied to the workspace: the text tool seeds
 * new text layers with the heading font, lists with the body font. */
export interface BrandFontDefaults {
  heading?: string;
  body?: string;
}

/** Style applied to the next shape a draw tool places — surfaced as the
 * tool-defaults inspector (GeoCarto's "Réglages {outil}" card). */
export interface ShapeDefaults {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  brushSize: number;
  brushStyle: BrushStyle;
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
  shapeDefaults: ShapeDefaults;
  fitRequest: number;
  aiDialog: AiDialog;
  /** Whether the "see all" artboard overview grid is open. Transient (not
   * persisted): a Figma-like contact sheet of every artboard in the project. */
  overviewMode: boolean;
  /** Whether the insert-SVG dialog (library / AI / upload) is open. */
  svgDialog: boolean;
  /** Whether the emoji picker dialog is open. */
  emojiDialog: boolean;
  /** When set, the SVG dialog runs in "marker picker" mode: the chosen SVG is
   * saved as an asset and set as the marker on this list layer instead of being
   * inserted as a new canvas layer. Cleared when the dialog closes. */
  markerPickerLayerId: string | null;
  /** Image layer currently in interactive crop mode, or null. */
  croppingLayerId: string | null;
  /** Whether the repair-assets modal (missing-asset relink flow) is open. */
  repairAssetsOpen: boolean;
  /** Whether the optimize-assets modal (downscale oversized rasters) is open. */
  optimizeAssetsOpen: boolean;
  /** Non-blocking toast raised when an oversized raster asset is imported. */
  assetHealthNotice: AssetHealthNotice | null;
  /** Generic transient confirmation toast (e.g. "saved as model"), or null. */
  toast: string | null;
  /** Soft limits for asset-health warnings; app preference, not project data. */
  assetHealthThresholds: AssetHealthThresholds;
  /** Brand-profile font defaults the text/list tools read, or null. */
  brandFontDefaults: BrandFontDefaults | null;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setTransparency: (mode: TransparencyMode) => void;
  setActiveTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGuides: (guides: CanvasGuide[]) => void;
  setShapeDefaults: (patch: Partial<ShapeDefaults>) => void;
  requestFit: () => void;
  setAiDialog: (dialog: AiDialog) => void;
  setOverviewMode: (open: boolean) => void;
  toggleOverviewMode: () => void;
  setSvgDialog: (open: boolean) => void;
  setEmojiDialog: (open: boolean) => void;
  setMarkerPickerLayerId: (id: string | null) => void;
  setCroppingLayerId: (id: string | null) => void;
  setRepairAssetsOpen: (open: boolean) => void;
  setOptimizeAssetsOpen: (open: boolean) => void;
  setAssetHealthNotice: (notice: AssetHealthNotice | null) => void;
  setToast: (message: string | null) => void;
  setAssetHealthThresholds: (patch: Partial<AssetHealthThresholds>) => void;
  setBrandFontDefaults: (defaults: BrandFontDefaults | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: resolveInitialTheme(),
  transparency: resolveInitialTransparency(),
  activeTool: 'select',
  zoom: 1,
  pan: { x: 0, y: 0 },
  snapEnabled: true,
  guides: [],
  shapeDefaults: {
    fill: '#FFFFFF',
    stroke: '#007AFF',
    strokeWidth: 2,
    strokeStyle: 'solid',
    brushSize: 6,
    brushStyle: 'smooth',
  },
  fitRequest: 0,
  aiDialog: 'none',
  overviewMode: false,
  svgDialog: false,
  emojiDialog: false,
  markerPickerLayerId: null,
  croppingLayerId: null,
  repairAssetsOpen: false,
  optimizeAssetsOpen: false,
  assetHealthNotice: null,
  toast: null,
  assetHealthThresholds: { ...DEFAULT_ASSET_HEALTH_THRESHOLDS },
  brandFontDefaults: null,
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
  setShapeDefaults: (patch) =>
    set({ shapeDefaults: { ...get().shapeDefaults, ...patch } }),
  requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
  setAiDialog: (aiDialog) => set({ aiDialog }),
  setOverviewMode: (overviewMode) => set({ overviewMode }),
  toggleOverviewMode: () => set({ overviewMode: !get().overviewMode }),
  setSvgDialog: (svgDialog) => set({ svgDialog }),
  setEmojiDialog: (emojiDialog) => set({ emojiDialog }),
  setMarkerPickerLayerId: (markerPickerLayerId) => set({ markerPickerLayerId }),
  setCroppingLayerId: (croppingLayerId) => set({ croppingLayerId }),
  setRepairAssetsOpen: (repairAssetsOpen) => set({ repairAssetsOpen }),
  setOptimizeAssetsOpen: (optimizeAssetsOpen) => set({ optimizeAssetsOpen }),
  setAssetHealthNotice: (assetHealthNotice) => set({ assetHealthNotice }),
  setToast: (toast) => set({ toast }),
  setAssetHealthThresholds: (patch) =>
    set({
      assetHealthThresholds: { ...get().assetHealthThresholds, ...patch },
    }),
  setBrandFontDefaults: (brandFontDefaults) => set({ brandFontDefaults }),
}));
