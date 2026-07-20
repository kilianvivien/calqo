import { afterEach, describe, expect, it } from 'vitest';
import {
  beginHistoryCoalescing,
  clearArtboardAnimation,
  clearLayerAnimation,
  createShapeLayer,
  duplicateLayerById,
  endHistoryCoalescing,
  redoProject,
  setClipFps,
  setLayerPreset,
  setSceneDuration,
  undoProject,
  updateLayerPresetParams,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { defaultPresetInstance } from '@/editor/animation/validate';
import { clipCacheSize, invalidateClipCache } from '@/editor/animation/compiler';
import { createDefaultProject, type CalqoProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { animationPlaybackStore } from '@/lib/state/animationPlaybackStore';

function setupProject(): { project: CalqoProject; layerId: string } {
  const project = createDefaultProject();
  const layer = createShapeLayer('rect', 10, 20, 100, 80);
  project.artboards[0].layers.push(layer);
  project.artboards[0].timing = { duration: 5000 };
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  selectionStore.getState().selectOne(layer.id);
  return { project, layerId: layer.id };
}

function currentLayer(projectId: string, layerId: string) {
  const project = projectStore.getState().projects[projectId];
  return findLayerInArtboard(project.artboards[0], layerId);
}

describe('animation commands', () => {
  afterEach(() => {
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
    animationPlaybackStore.getState().stopAndReset();
    invalidateClipCache();
  });

  it('sets an enter preset and records one undoable step', () => {
    const { project, layerId } = setupProject();
    const result = setLayerPreset(
      project.id,
      layerId,
      'enter',
      defaultPresetInstance('fade'),
    );
    expect(result.ok).toBe(true);
    const layer = currentLayer(project.id, layerId);
    expect(layer?.animation).toMatchObject({ mode: 'preset', enter: { kind: 'fade' } });
    expect(historyStore.getState().histories[project.id].past).toHaveLength(1);
  });

  it('clearing the last slot removes the animation field entirely', () => {
    const { project, layerId } = setupProject();
    setLayerPreset(project.id, layerId, 'enter', defaultPresetInstance('fade'));
    setLayerPreset(project.id, layerId, 'enter', null);
    expect(currentLayer(project.id, layerId)?.animation).toBeUndefined();
  });

  it('rejects a preset whose window does not fit the scene', () => {
    const { project, layerId } = setupProject();
    setSceneDuration(project.id, 250); // minimum scene
    const result = setLayerPreset(project.id, layerId, 'enter', {
      kind: 'fade',
      duration: 4000, // far longer than the 250ms scene
      delay: 0,
    });
    expect(result).toEqual({ ok: false, code: 'window-exceeds-scene' });
    // Nothing was written.
    expect(currentLayer(project.id, layerId)?.animation).toBeUndefined();
  });

  it('rejects an enter/exit pair that overlaps in time', () => {
    const { project, layerId } = setupProject();
    setSceneDuration(project.id, 1000);
    setLayerPreset(project.id, layerId, 'enter', { kind: 'fade', duration: 800, delay: 0 });
    const result = setLayerPreset(project.id, layerId, 'exit', {
      kind: 'fade',
      duration: 800,
      delay: 0,
    });
    expect(result).toEqual({ ok: false, code: 'slot-window-overlap' });
  });

  it('rejects a text-reveal preset on a non-text layer (AN-3.5)', () => {
    // Text reveals only apply to text/list layers; the setup layer is a shape.
    const { project, layerId } = setupProject();
    const result = setLayerPreset(project.id, layerId, 'enter', {
      kind: 'typewriter',
      duration: 500,
      delay: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unsupported-layer-kind');
  });

  it('coalesces slider-driven parameter changes into one undo step', () => {
    const { project, layerId } = setupProject();
    setLayerPreset(project.id, layerId, 'enter', defaultPresetInstance('slide'));
    const before = historyStore.getState().histories[project.id].past.length;

    beginHistoryCoalescing();
    updateLayerPresetParams(project.id, layerId, 'enter', { duration: 500 });
    updateLayerPresetParams(project.id, layerId, 'enter', { duration: 550 });
    updateLayerPresetParams(project.id, layerId, 'enter', { duration: 600 });
    endHistoryCoalescing();

    const after = historyStore.getState().histories[project.id].past.length;
    expect(after - before).toBe(1);
    expect(currentLayer(project.id, layerId)?.animation).toMatchObject({
      enter: { duration: 600 },
    });
  });

  it('undo restores document state and stops playback', () => {
    const { project, layerId } = setupProject();
    setLayerPreset(project.id, layerId, 'enter', defaultPresetInstance('pop'));
    animationPlaybackStore.setState({ status: 'playing', timeMs: 1200 });

    undoProject(project.id);
    expect(currentLayer(project.id, layerId)?.animation).toBeUndefined();
    expect(animationPlaybackStore.getState().status).toBe('idle');
    expect(animationPlaybackStore.getState().timeMs).toBe(0);

    redoProject(project.id);
    expect(currentLayer(project.id, layerId)?.animation).toMatchObject({
      enter: { kind: 'pop' },
    });
  });

  it('clears all animation on an artboard', () => {
    const { project, layerId } = setupProject();
    setLayerPreset(project.id, layerId, 'enter', defaultPresetInstance('fade'));
    clearArtboardAnimation(project.id);
    expect(currentLayer(project.id, layerId)?.animation).toBeUndefined();
  });

  it('clears a single layer animation', () => {
    const { project, layerId } = setupProject();
    setLayerPreset(project.id, layerId, 'emphasis', defaultPresetInstance('pulse'));
    clearLayerAnimation(project.id, layerId);
    expect(currentLayer(project.id, layerId)?.animation).toBeUndefined();
  });

  it('sets and clamps the scene duration', () => {
    const { project } = setupProject();
    setSceneDuration(project.id, 999999);
    expect(projectStore.getState().projects[project.id].artboards[0].timing?.duration).toBe(60000);
    setSceneDuration(project.id, 1);
    expect(projectStore.getState().projects[project.id].artboards[0].timing?.duration).toBe(250);
  });

  it('sets the clip fps', () => {
    const { project } = setupProject();
    setClipFps(project.id, 60);
    expect(projectStore.getState().projects[project.id].clipSettings?.fps).toBe(60);
  });

  it('duplicating a layer carries its animation to the copy', () => {
    const { project, layerId } = setupProject();
    setLayerPreset(project.id, layerId, 'enter', defaultPresetInstance('rise'));
    duplicateLayerById(project.id, layerId);
    const layers = projectStore.getState().projects[project.id].artboards[0].layers;
    expect(layers).toHaveLength(2);
    const copy = layers.find((l) => l.id !== layerId);
    expect(copy?.animation).toMatchObject({ mode: 'preset', enter: { kind: 'rise' } });
  });

  it('a preset change invalidates the compiled clip cache for that project', () => {
    const { project, layerId } = setupProject();
    // Populate the cache via a command, then confirm a later edit does not leak
    // stale entries — undo explicitly drops them.
    setLayerPreset(project.id, layerId, 'enter', defaultPresetInstance('fade'));
    undoProject(project.id);
    expect(clipCacheSize()).toBe(0);
  });
});
