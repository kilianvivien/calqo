import type { Easing, Keyframe, LayerAnimation, Track } from '@/lib/schema';
import { evaluateWindowsInto, createIdentityOverride } from './evaluator';
import type { CompiledWindow, WrapperOverride } from './types';

/**
 * The intentionally small keyframe surface edits a whole transform pose, not
 * separate property lanes. Keeping the tracks aligned lets the UI render one
 * diamond per pose while retaining the existing validated custom-track IR.
 */
export const MOTION_PROPS = [
  'dx',
  'dy',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
] as const;

export type MotionProp = (typeof MOTION_PROPS)[number];
export type MotionPose = Pick<
  WrapperOverride,
  'dx' | 'dy' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'
>;

interface MotionMatrixDecomposition {
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** Recover wrapper attributes from its affine matrix. Konva's transform
 * decomposition exposes the rotation/scales, while translation must be
 * converted back from matrix origin to Calqo's layer-centre pivot. */
export function motionPoseFromWrapperMatrix(
  matrix: readonly [number, number, number, number, number, number],
  decomposition: MotionMatrixDecomposition,
  box: { x: number; y: number; w: number; h: number },
  opacity: number,
): MotionPose {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    dx: matrix[4] - cx + matrix[0] * cx + matrix[2] * cy,
    dy: matrix[5] - cy + matrix[1] * cx + matrix[3] * cy,
    scaleX: decomposition.scaleX,
    scaleY: decomposition.scaleY,
    rotation: decomposition.rotation,
    opacity,
  };
}

export const IDENTITY_MOTION_POSE: Readonly<MotionPose> = Object.freeze({
  dx: 0,
  dy: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
});

const TIME_EPSILON = 1e-6;

function sameTimes(a: Keyframe[], b: Keyframe[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (keyframe, index) => Math.abs(keyframe.t - b[index].t) <= TIME_EPSILON,
    )
  );
}

/** Whether a custom animation follows Calqo's compact, scene-spanning pose IR. */
export function isEditableMotion(
  animation: LayerAnimation | undefined,
  sceneDurationMs: number,
): animation is Extract<LayerAnimation, { mode: 'custom' }> {
  if (animation?.mode !== 'custom' || animation.windows.length !== 1)
    return false;
  const window = animation.windows[0];
  if (
    Math.abs(window.start) > TIME_EPSILON ||
    Math.abs(window.duration - sceneDurationMs) > TIME_EPSILON ||
    window.tracks.length !== MOTION_PROPS.length
  ) {
    return false;
  }
  const byProp = new Map(window.tracks.map((track) => [track.prop, track]));
  const first = byProp.get(MOTION_PROPS[0]);
  return (
    !!first &&
    MOTION_PROPS.every((prop) => {
      const track = byProp.get(prop);
      return !!track && sameTimes(first.keyframes, track.keyframes);
    })
  );
}

function identityValue(prop: MotionProp): number {
  return IDENTITY_MOTION_POSE[prop];
}

/** Create the two endpoint poses required by the schema. */
export function createEditableMotion(
  sceneDurationMs: number,
): Extract<LayerAnimation, { mode: 'custom' }> {
  return {
    mode: 'custom',
    windows: [
      {
        start: 0,
        duration: sceneDurationMs,
        tracks: MOTION_PROPS.map((prop) => ({
          prop,
          keyframes: [
            { t: 0, value: identityValue(prop) },
            { t: 1, value: identityValue(prop), easing: 'ease-in-out' },
          ],
        })),
      },
    ],
  };
}

function compiledWindow(
  animation: Extract<LayerAnimation, { mode: 'custom' }>,
): CompiledWindow {
  const window = animation.windows[0];
  return {
    start: window.start,
    duration: window.duration,
    tracks: window.tracks.map((track) => ({
      prop: track.prop,
      keyframes: track.keyframes.map((keyframe, index) => ({
        ...keyframe,
        easing: keyframe.easing ?? (index === 0 ? 'linear' : 'ease-in-out'),
      })),
    })),
  };
}

/** Evaluate the visible pose at the playhead so inserting a keyframe is inert. */
export function motionPoseAt(
  animation: LayerAnimation | undefined,
  sceneDurationMs: number,
  timeMs: number,
): MotionPose {
  if (!isEditableMotion(animation, sceneDurationMs)) {
    return { ...IDENTITY_MOTION_POSE };
  }
  const override = evaluateWindowsInto(
    [compiledWindow(animation)],
    Math.max(0, Math.min(timeMs, sceneDurationMs)),
    createIdentityOverride(),
  );
  return {
    dx: override.dx,
    dy: override.dy,
    scaleX: override.scaleX,
    scaleY: override.scaleY,
    rotation: override.rotation,
    opacity: override.opacity,
  };
}

/** Scene-relative keyframe times used by the compact diamond lane. */
export function motionKeyframeTimes(
  animation: LayerAnimation | undefined,
  sceneDurationMs: number,
): number[] {
  if (!isEditableMotion(animation, sceneDurationMs)) return [];
  return animation.windows[0].tracks[0].keyframes.map((keyframe) =>
    Math.round(keyframe.t * sceneDurationMs),
  );
}

function normalizedTime(timeMs: number, sceneDurationMs: number): number {
  if (sceneDurationMs <= 0) return 0;
  return Math.max(0, Math.min(1, Math.round(timeMs) / sceneDurationMs));
}

function upsertKeyframe(
  keyframes: Keyframe[],
  t: number,
  value: number,
  easing: Easing,
): Keyframe[] {
  const next = keyframes.map((keyframe) => ({ ...keyframe }));
  const existing = next.findIndex(
    (keyframe) => Math.abs(keyframe.t - t) <= TIME_EPSILON,
  );
  const keyframe: Keyframe = {
    t,
    value,
    ...(t > 0 ? { easing } : {}),
  };
  if (existing >= 0) next[existing] = keyframe;
  else next.push(keyframe);
  next.sort((a, b) => a.t - b.t);
  return next;
}

/** Insert or update one aligned transform pose. */
export function upsertMotionKeyframe(
  animation: LayerAnimation | undefined,
  sceneDurationMs: number,
  timeMs: number,
  pose: MotionPose,
  easing: Easing = 'ease-in-out',
): Extract<LayerAnimation, { mode: 'custom' }> {
  const next = isEditableMotion(animation, sceneDurationMs)
    ? structuredClone(animation)
    : createEditableMotion(sceneDurationMs);
  const t = normalizedTime(timeMs, sceneDurationMs);
  next.windows[0].tracks = next.windows[0].tracks.map((track) => ({
    ...track,
    keyframes: upsertKeyframe(
      track.keyframes,
      t,
      pose[track.prop as MotionProp],
      easing,
    ),
  })) as Track[];
  return next;
}

/** Remove one pose while preserving the schema's minimum of two keyframes. */
export function removeMotionKeyframe(
  animation: LayerAnimation | undefined,
  sceneDurationMs: number,
  timeMs: number,
): Extract<LayerAnimation, { mode: 'custom' }> | null {
  if (!isEditableMotion(animation, sceneDurationMs)) return null;
  const firstTrack = animation.windows[0].tracks[0];
  if (firstTrack.keyframes.length <= 2) return null;
  const t = normalizedTime(timeMs, sceneDurationMs);
  // Start/end poses define the scene bounds and stay permanent in the compact
  // editor; only intermediate diamonds can be deleted.
  if (t <= TIME_EPSILON || t >= 1 - TIME_EPSILON) return null;
  const next = structuredClone(animation);
  next.windows[0].tracks = next.windows[0].tracks.map((track) => ({
    ...track,
    keyframes: track.keyframes.filter(
      (keyframe) => Math.abs(keyframe.t - t) > TIME_EPSILON,
    ),
  })) as Track[];
  return next;
}

export function hasMotionKeyframeAt(
  animation: LayerAnimation | undefined,
  sceneDurationMs: number,
  timeMs: number,
): boolean {
  const rounded = Math.round(timeMs);
  return motionKeyframeTimes(animation, sceneDurationMs).includes(rounded);
}
