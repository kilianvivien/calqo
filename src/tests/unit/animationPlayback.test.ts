import { afterEach, describe, expect, it } from 'vitest';
import { animationPlaybackStore } from '@/lib/state/animationPlaybackStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import {
  wrapperAttrs,
  wipeClipRect,
  type LayerBox,
} from '@/editor/animation/wrapperNode';
import { createIdentityOverride } from '@/editor/animation/evaluator';
import { defaultPresetInstance } from '@/editor/animation/validate';

const box: LayerBox = { x: 100, y: 200, w: 40, h: 60 };

describe('wrapperNode math', () => {
  it('an identity override composes to a net no-op transform', () => {
    const attrs = wrapperAttrs(createIdentityOverride(), box);
    // Position equals offset (center), so translation cancels; scale/rotation/
    // opacity are neutral — the base node renders exactly as document geometry.
    expect(attrs.x).toBe(attrs.offsetX);
    expect(attrs.y).toBe(attrs.offsetY);
    expect(attrs.offsetX).toBe(120); // 100 + 40/2
    expect(attrs.offsetY).toBe(230); // 200 + 60/2
    expect(attrs.scaleX).toBe(1);
    expect(attrs.scaleY).toBe(1);
    expect(attrs.rotation).toBe(0);
    expect(attrs.opacity).toBe(1);
  });

  it('dx/dy translate the wrapper position away from the center offset', () => {
    const override = createIdentityOverride();
    override.dx = 15;
    override.dy = -5;
    const attrs = wrapperAttrs(override, box);
    expect(attrs.x - attrs.offsetX).toBe(15);
    expect(attrs.y - attrs.offsetY).toBe(-5);
  });

  it('scale/rotation are carried through around the center offset', () => {
    const override = createIdentityOverride();
    override.scaleX = 2;
    override.scaleY = 0.5;
    override.rotation = 30;
    override.opacity = 0.4;
    const attrs = wrapperAttrs(override, box);
    expect(attrs.scaleX).toBe(2);
    expect(attrs.scaleY).toBe(0.5);
    expect(attrs.rotation).toBe(30);
    expect(attrs.opacity).toBe(0.4);
    expect(attrs.offsetX).toBe(120);
    expect(attrs.offsetY).toBe(230);
  });

  it('a full wipe needs no clip; a partial wipe clips from the given edge', () => {
    expect(wipeClipRect(box, 1, 'left')).toBeNull();
    expect(wipeClipRect(box, 0.5, 'left')).toEqual({ x: 100, y: 200, width: 20, height: 60 });
    expect(wipeClipRect(box, 0.5, 'right')).toEqual({ x: 120, y: 200, width: 20, height: 60 });
    expect(wipeClipRect(box, 0.5, 'up')).toEqual({ x: 100, y: 200, width: 40, height: 30 });
    expect(wipeClipRect(box, 0.5, 'down')).toEqual({ x: 100, y: 230, width: 40, height: 30 });
  });
});

describe('animationPlaybackStore', () => {
  afterEach(() => {
    animationPlaybackStore.setState({
      projectId: null,
      artboardId: null,
      status: 'idle',
      timeMs: 0,
      durationMs: 0,
      preview: null,
    });
  });

  it('binding to a new artboard rewinds and stops', () => {
    const s = animationPlaybackStore.getState();
    s.bind('p1', 'a1', 5000);
    s.play();
    s.seek(2000);
    expect(animationPlaybackStore.getState().timeMs).toBe(2000);
    // Switching artboards resets time and status.
    animationPlaybackStore.getState().bind('p1', 'a2', 3000);
    expect(animationPlaybackStore.getState().timeMs).toBe(0);
    expect(animationPlaybackStore.getState().status).toBe('idle');
    expect(animationPlaybackStore.getState().durationMs).toBe(3000);
  });

  it('binding to the same artboard keeps the playhead but clamps it', () => {
    const s = animationPlaybackStore.getState();
    s.bind('p1', 'a1', 5000);
    s.seek(4000);
    animationPlaybackStore.getState().bind('p1', 'a1', 3000);
    expect(animationPlaybackStore.getState().timeMs).toBe(3000);
  });

  it('seek clamps into range and pauses when idle', () => {
    const s = animationPlaybackStore.getState();
    s.bind('p1', 'a1', 5000);
    s.seek(9999);
    expect(animationPlaybackStore.getState().timeMs).toBe(5000);
    expect(animationPlaybackStore.getState().status).toBe('paused');
    s.seek(-10);
    expect(animationPlaybackStore.getState().timeMs).toBe(0);
  });

  it('play from the end restarts at zero', () => {
    const s = animationPlaybackStore.getState();
    s.bind('p1', 'a1', 5000);
    s.seek(5000);
    animationPlaybackStore.getState().play();
    expect(animationPlaybackStore.getState().timeMs).toBe(0);
    expect(animationPlaybackStore.getState().status).toBe('playing');
  });

  it('stopAndReset clears status, time, and preview', () => {
    const s = animationPlaybackStore.getState();
    s.bind('p1', 'a1', 5000);
    s.play();
    s.setPreview({ layerId: 'l1', slot: 'enter', instance: defaultPresetInstance('fade') });
    animationPlaybackStore.getState().stopAndReset();
    const after = animationPlaybackStore.getState();
    expect(after.status).toBe('idle');
    expect(after.timeMs).toBe(0);
    expect(after.preview).toBeNull();
  });
});

describe('workspace mode', () => {
  afterEach(() => {
    useWorkspaceStore.setState({ openTabIds: [], activeProjectId: null, modeByProject: {} });
  });

  it('defaults to design and switches per project without leaking', () => {
    const s = useWorkspaceStore.getState();
    s.openTab('p1');
    s.openTab('p2');
    expect(useWorkspaceStore.getState().modeByProject.p1).toBeUndefined();
    s.setMode('p1', 'animate');
    expect(useWorkspaceStore.getState().modeByProject.p1).toBe('animate');
    // p2 is unaffected — mode never leaks across projects.
    expect(useWorkspaceStore.getState().modeByProject.p2).toBeUndefined();
  });

  it('drops mode entries when a tab closes', () => {
    const s = useWorkspaceStore.getState();
    s.openTab('p1');
    s.setMode('p1', 'animate');
    s.closeTab('p1');
    expect(useWorkspaceStore.getState().modeByProject.p1).toBeUndefined();
  });
});
