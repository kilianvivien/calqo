import { create } from 'zustand';
import { appSettings } from '@/lib/adapters';
import { looksLikeSvg, sanitizeSvg } from '@/lib/utils/svg';

/** Persistent, app-level collection of SVGs the user saved from the AI
 * generation tool. These live alongside the bundled `SVG_LIBRARY` but, unlike
 * those, are user-authored and survive reloads via the settings adapter (so a
 * Tauri build keeps them too). They surface as a dedicated "Generated" section
 * in the SVG picker. */
const SETTINGS_KEY = 'svg.saved';

/** Cap the collection so persisted settings can't grow without bound. */
const MAX_SAVED = 60;

export interface SavedSvg {
  id: string;
  /** User-facing label, derived from the generating prompt. */
  name: string;
  /** Sanitised SVG markup, ready to render/insert. */
  svg: string;
  /** Epoch ms; newest are shown first. */
  createdAt: number;
}

function newId(): string {
  return `svg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isSavedSvg(value: unknown): value is SavedSvg {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.svg === 'string' &&
    typeof item.createdAt === 'number'
  );
}

function normalize(stored: unknown): SavedSvg[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(isSavedSvg)
    .filter((item) => looksLikeSvg(item.svg))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SAVED);
}

let persistChain: Promise<void> = Promise.resolve();

function persist(items: SavedSvg[]): void {
  const snapshot = structuredClone(items);
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => appSettings.set(SETTINGS_KEY, snapshot))
    .catch((err) => {
      console.error('[Calqo] failed to persist saved SVGs', err);
    });
}

interface SavedSvgState {
  items: SavedSvg[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Persist a generated SVG; returns the new entry's id (or null if invalid).
   * Identical markup already saved is left untouched and its id returned. */
  add: (svg: string, name: string) => string | null;
  remove: (id: string) => void;
}

export const useSavedSvgStore = create<SavedSvgState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const stored = await appSettings.get<unknown>(SETTINGS_KEY);
      set({ items: normalize(stored), loaded: true });
      return;
    } catch (err) {
      console.error('[Calqo] failed to load saved SVGs', err);
    }
    set({ loaded: true });
  },

  add: (rawSvg, name) => {
    const svg = sanitizeSvg(rawSvg);
    if (!looksLikeSvg(svg)) return null;
    const existing = get().items.find((item) => item.svg === svg);
    if (existing) return existing.id;
    const entry: SavedSvg = {
      id: newId(),
      name: name.trim() || 'Generated SVG',
      svg,
      createdAt: Date.now(),
    };
    const next = [entry, ...get().items].slice(0, MAX_SAVED);
    set({ items: next });
    persist(next);
    return entry.id;
  },

  remove: (id) => {
    const next = get().items.filter((item) => item.id !== id);
    set({ items: next });
    persist(next);
  },
}));

/** Non-reactive accessor for non-component callers. */
export const savedSvgStore = useSavedSvgStore;
