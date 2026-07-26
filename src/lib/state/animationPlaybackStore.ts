import { create } from 'zustand';
import type { PresetInstance } from '@/lib/schema';
import type { PresetSlot } from '@/editor/animation/presets';

/** Transport status for Animate-mode playback. */
export type PlaybackStatus = 'idle' | 'playing' | 'paused';

/** A transient hover/focus preview of a single slot preset, applied on top of
 * the committed animation without touching the document or history (§6.5). */
export interface PreviewPreset {
  layerId: string;
  slot: PresetSlot;
  instance: PresetInstance;
}

/**
 * Transient playback state for Animate mode. None of this is persisted or
 * enters undo history (docs/calqo-animation-extension-plan.md §6.2): transport
 * time, status, and the hover preview are UI-only. The RAF loop that drives
 * Konva wrapper nodes lives in `useAnimationPlayback`; it advances `timeMs`
 * here so the transport (scrubber + time label) can render.
 */
interface AnimationPlaybackState {
  /** Project/artboard the transport is bound to (identity for reset guards). */
  projectId: string | null;
  artboardId: string | null;
  status: PlaybackStatus;
  /** Current transport time in ms from scene start. */
  timeMs: number;
  /** Scene duration in ms (mirrored for the scrubber range). */
  durationMs: number;
  /** Active hover/focus preview, or null. */
  preview: PreviewPreset | null;

  /** Bind the transport to an artboard, resetting time when it changes. */
  bind: (projectId: string, artboardId: string, durationMs: number) => void;
  play: () => void;
  pause: () => void;
  /** Move the playhead; keeps the current status (paused stays paused). */
  seek: (timeMs: number) => void;
  /** Internal: the RAF loop reports the advanced time. */
  reportTime: (timeMs: number) => void;
  /** Stop playback and rewind to 0 — used on any edit / context switch. */
  stopAndReset: () => void;
  setPreview: (preview: PreviewPreset | null) => void;
}

export const useAnimationPlaybackStore = create<AnimationPlaybackState>(
  (set, get) => ({
    projectId: null,
    artboardId: null,
    status: 'idle',
    timeMs: 0,
    durationMs: 0,
    preview: null,

    bind: (projectId, artboardId, durationMs) => {
      const s = get();
      const changed =
        s.projectId !== projectId || s.artboardId !== artboardId;
      set({
        projectId,
        artboardId,
        durationMs,
        // A context switch always stops and rewinds; a duration change keeps
        // the playhead but clamps it into range.
        status: changed ? 'idle' : s.status,
        timeMs: changed ? 0 : Math.min(s.timeMs, durationMs),
        preview: changed ? null : s.preview,
      });
    },

    play: () => {
      const { durationMs, timeMs } = get();
      // Restart from the top when the playhead already sits at the end.
      set({
        status: 'playing',
        timeMs: timeMs >= durationMs ? 0 : timeMs,
      });
    },

    pause: () => {
      if (get().status === 'playing') set({ status: 'paused' });
    },

    seek: (timeMs) => {
      const { durationMs, status } = get();
      const clamped = Math.max(0, Math.min(timeMs, durationMs));
      set({ timeMs: clamped, status: status === 'idle' ? 'paused' : status });
    },

    reportTime: (timeMs) => set({ timeMs }),

    stopAndReset: () => {
      const { status, timeMs, preview } = get();
      if (status === 'idle' && timeMs === 0 && preview === null) return;
      set({ status: 'idle', timeMs: 0, preview: null });
    },

    setPreview: (preview) => set({ preview }),
  }),
);

export const animationPlaybackStore = useAnimationPlaybackStore;
