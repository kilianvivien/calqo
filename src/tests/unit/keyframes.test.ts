import { describe, expect, it } from 'vitest';
import { layerAnimationSchema } from '@/lib/schema';
import {
  createEditableMotion,
  hasMotionKeyframeAt,
  isEditableMotion,
  motionKeyframeTimes,
  motionPoseAt,
  motionPoseFromWrapperMatrix,
  removeMotionKeyframe,
  upsertMotionKeyframe,
} from '@/editor/animation/keyframes';

describe('compact keyframe motion', () => {
  it('creates a valid scene-spanning pose with identity endpoints', () => {
    const animation = createEditableMotion(5000);
    expect(layerAnimationSchema.safeParse(animation).success).toBe(true);
    expect(isEditableMotion(animation, 5000)).toBe(true);
    expect(motionKeyframeTimes(animation, 5000)).toEqual([0, 5000]);
    expect(motionPoseAt(animation, 5000, 2500)).toMatchObject({
      dx: 0,
      dy: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    });
  });

  it('inserts aligned whole-pose keyframes and evaluates them exactly', () => {
    const animation = upsertMotionKeyframe(
      createEditableMotion(5000),
      5000,
      2000,
      {
        dx: 120,
        dy: -40,
        scaleX: 1.5,
        scaleY: 0.8,
        rotation: 30,
        opacity: 0.6,
      },
    );
    expect(motionKeyframeTimes(animation, 5000)).toEqual([0, 2000, 5000]);
    expect(hasMotionKeyframeAt(animation, 5000, 2000)).toBe(true);
    expect(motionPoseAt(animation, 5000, 2000)).toMatchObject({
      dx: 120,
      dy: -40,
      scaleX: 1.5,
      scaleY: 0.8,
      rotation: 30,
      opacity: 0.6,
    });
    const tracks = animation.windows[0].tracks;
    expect(tracks.every((track) => track.keyframes.length === 3)).toBe(true);
    expect(layerAnimationSchema.safeParse(animation).success).toBe(true);
  });

  it('samples the current interpolation when adding an inert pose', () => {
    const duration = 4000;
    const endPose = {
      dx: 100,
      dy: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    };
    const moving = upsertMotionKeyframe(
      createEditableMotion(duration),
      duration,
      duration,
      endPose,
    );
    const sampled = motionPoseAt(moving, duration, 2000);
    const withMiddle = upsertMotionKeyframe(moving, duration, 2000, sampled);
    expect(motionPoseAt(withMiddle, duration, 2000)).toEqual(sampled);
  });

  it('does not delete below the two-pose schema minimum', () => {
    const animation = createEditableMotion(3000);
    expect(removeMotionKeyframe(animation, 3000, 0)).toBeNull();

    const withMiddle = upsertMotionKeyframe(animation, 3000, 1500, {
      dx: 10,
      dy: 20,
      scaleX: 1,
      scaleY: 1,
      rotation: 5,
      opacity: 1,
    });
    expect(removeMotionKeyframe(withMiddle, 3000, 0)).toBeNull();
    expect(removeMotionKeyframe(withMiddle, 3000, 3000)).toBeNull();
    const removed = removeMotionKeyframe(withMiddle, 3000, 1500);
    expect(motionKeyframeTimes(removed ?? undefined, 3000)).toEqual([0, 3000]);
  });

  it('recovers a centre-pivot wrapper pose from its affine matrix', () => {
    const box = { x: 100, y: 60, w: 200, h: 80 };
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rotation = 30;
    const radians = (rotation * Math.PI) / 180;
    const scaleX = 1.4;
    const scaleY = 0.75;
    const dx = 80;
    const dy = -25;
    const a = Math.cos(radians) * scaleX;
    const b = Math.sin(radians) * scaleX;
    const c = -Math.sin(radians) * scaleY;
    const d = Math.cos(radians) * scaleY;
    const matrix: [number, number, number, number, number, number] = [
      a,
      b,
      c,
      d,
      cx + dx - a * cx - c * cy,
      cy + dy - b * cx - d * cy,
    ];
    expect(
      motionPoseFromWrapperMatrix(
        matrix,
        { rotation, scaleX, scaleY },
        box,
        0.7,
      ),
    ).toMatchObject({ dx, dy, rotation, scaleX, scaleY, opacity: 0.7 });
  });
});
