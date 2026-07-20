import {
  DEFAULT_SCENE_DURATION_MS,
  MAX_CLIP_DURATION_MS,
  sceneTransitionDurationMs,
  type CalqoArtboard,
  type CalqoProject,
  type SceneTransitionKind,
} from '@/lib/schema';

/**
 * Runtime scene-sequence model (plan §4.1 v2 / AN-4.2). Turns the persisted
 * `clipSettings.scenes` ordering into a resolved timeline the exporter and
 * renderer sample by absolute clip time. A transition plays *into* a scene from
 * the previous one and is inserted between the two scenes' content, so:
 *
 *   total = Σ scene durations + Σ transition durations (from the 2nd scene on)
 *
 * Nothing here is persisted — it is derived deterministically from the document.
 */

export interface ResolvedTransition {
  kind: SceneTransitionKind;
  durationMs: number;
}

export interface ResolvedScene {
  index: number;
  artboardId: string;
  artboard: CalqoArtboard;
  /** Global ms at which this scene's own content begins (after its transition). */
  startMs: number;
  /** Scene content duration in ms. */
  durationMs: number;
  /** Transition into this scene from the previous one (cut/0 for the first). */
  transitionIn: ResolvedTransition;
}

export interface ResolvedSequence {
  scenes: ResolvedScene[];
  totalMs: number;
  /** Clip output size — every scene shares these dimensions (validated). */
  width: number;
  height: number;
}

/** What to render at a sampled clip time. */
export type SequenceSample =
  | { kind: 'scene'; scene: ResolvedScene; localMs: number }
  | {
      kind: 'transition';
      from: ResolvedScene;
      to: ResolvedScene;
      transition: ResolvedTransition;
      /** 0 → outgoing fully shown, 1 → incoming fully shown. */
      progress: number;
    };

function sceneDurationOf(artboard: CalqoArtboard): number {
  return artboard.timing?.duration ?? DEFAULT_SCENE_DURATION_MS;
}

/**
 * Resolve a project's `clipSettings.scenes` into a timeline. Returns `null` when
 * the project has no multi-scene clip (fewer than one scene) — callers fall back
 * to the single-artboard export path. Throws if a scene references a missing
 * artboard (validation should have caught it upstream via `safeImportProject`).
 */
export function resolveSequence(project: CalqoProject): ResolvedSequence | null {
  const entries = project.clipSettings?.scenes;
  if (!entries || entries.length === 0) return null;
  const byId = new Map(project.artboards.map((a) => [a.id, a]));

  const scenes: ResolvedScene[] = [];
  let cursor = 0;
  let width = 0;
  let height = 0;
  entries.forEach((entry, index) => {
    const artboard = byId.get(entry.artboardId);
    if (!artboard) throw new Error(`scene references unknown artboard "${entry.artboardId}"`);
    if (index === 0) {
      width = artboard.width;
      height = artboard.height;
    }
    const transitionIn: ResolvedTransition =
      index === 0
        ? { kind: 'cut', durationMs: 0 }
        : { kind: entry.transition ?? 'cut', durationMs: sceneTransitionDurationMs(entry) };
    cursor += transitionIn.durationMs;
    const durationMs = sceneDurationOf(artboard);
    scenes.push({ index, artboardId: entry.artboardId, artboard, startMs: cursor, durationMs, transitionIn });
    cursor += durationMs;
  });

  return { scenes, totalMs: cursor, width, height };
}

/**
 * Sample the sequence at an absolute clip time (ms). During a transition window
 * both neighbouring scenes are active (the outgoing at its final frame, the
 * incoming at its first); otherwise a single scene plays at its local time.
 */
export function sampleSequence(sequence: ResolvedSequence, globalMs: number): SequenceSample {
  const { scenes } = sequence;
  const t = Math.max(0, Math.min(globalMs, sequence.totalMs));
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    // Transition window sits immediately before this scene's content.
    const trans = scene.transitionIn;
    if (i > 0 && trans.durationMs > 0) {
      const transStart = scene.startMs - trans.durationMs;
      if (t < scene.startMs) {
        const progress = trans.durationMs <= 0 ? 1 : (t - transStart) / trans.durationMs;
        return {
          kind: 'transition',
          from: scenes[i - 1],
          to: scene,
          transition: trans,
          progress: Math.max(0, Math.min(1, progress)),
        };
      }
    }
    if (t <= scene.startMs + scene.durationMs) {
      return { kind: 'scene', scene, localMs: Math.max(0, t - scene.startMs) };
    }
  }
  // Past the end: hold the last scene's final frame.
  const last = scenes[scenes.length - 1];
  return { kind: 'scene', scene: last, localMs: last.durationMs };
}

// ---------------------------------------------------------------------------
// Validation (for the command layer / UI preview — the schema enforces the same
// rules on parse, but commands need issues before committing an edit).
// ---------------------------------------------------------------------------

export interface SceneSequenceIssue {
  index?: number;
  code: 'unknown-artboard' | 'duplicate-artboard' | 'size-mismatch' | 'clip-too-long';
  message: string;
}

/** Validate a candidate scene list against the project without mutating it. */
export function validateSceneSequence(project: CalqoProject): SceneSequenceIssue[] {
  const entries = project.clipSettings?.scenes;
  if (!entries || entries.length === 0) return [];
  const byId = new Map(project.artboards.map((a) => [a.id, a]));
  const issues: SceneSequenceIssue[] = [];
  const seen = new Set<string>();
  let total = 0;
  let dims: { w: number; h: number } | undefined;
  entries.forEach((entry, index) => {
    const artboard = byId.get(entry.artboardId);
    if (!artboard) {
      issues.push({ index, code: 'unknown-artboard', message: `Unknown artboard "${entry.artboardId}"` });
      return;
    }
    if (seen.has(entry.artboardId)) {
      issues.push({ index, code: 'duplicate-artboard', message: `Artboard "${entry.artboardId}" is used more than once` });
    }
    seen.add(entry.artboardId);
    if (!dims) dims = { w: artboard.width, h: artboard.height };
    else if (artboard.width !== dims.w || artboard.height !== dims.h) {
      issues.push({ index, code: 'size-mismatch', message: `Scene ${index + 1} size differs from the clip size` });
    }
    total += sceneDurationOf(artboard);
    if (index > 0) total += sceneTransitionDurationMs(entry);
  });
  if (total > MAX_CLIP_DURATION_MS) {
    issues.push({ code: 'clip-too-long', message: `Clip is ${(total / 1000).toFixed(1)}s, over the 60s limit` });
  }
  return issues;
}
