import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnimationInspector } from '@/app/shell/animation/AnimationInspector';
import { createDefaultProject, type CalqoProject } from '@/lib/schema';
import { createTextLayer, setLayerPreset } from '@/editor/commands/projectCommands';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { historyStore } from '@/lib/state/historyStore';
import { animationPlaybackStore } from '@/lib/state/animationPlaybackStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';

/**
 * The Animate inspector's timing knobs are bounded by the scene, not by a fixed
 * 4 s cap: a typewriter over a long paragraph needs seconds. The scene itself
 * runs to `MAX_SCENE_DURATION_MS`, and the command layer rejects a slot window
 * that runs past it, so the sliders track the scene exactly.
 */
async function renderInspector(
  sceneDurationMs: number,
  enter: { duration: number; delay: number } = { duration: 1200, delay: 0 },
): Promise<{
  project: CalqoProject;
  layerId: string;
}> {
  const project = createDefaultProject();
  const layer = createTextLayer(project, 0, 0);
  project.artboards[0].layers.push(layer);
  project.artboards[0].timing = { duration: sceneDurationMs };
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  selectionStore.getState().selectOne(layer.id);
  useWorkspaceStore.setState({
    openTabIds: [project.id],
    activeProjectId: project.id,
    modeByProject: { [project.id]: 'animate' },
  });
  setLayerPreset(project.id, layer.id, 'enter', { kind: 'typewriter', ...enter });
  await act(async () => {
    render(<AnimationInspector />);
  });
  return { project, layerId: layer.id };
}

/** The enter slot's duration/delay sliders (the scene has a "Duration" too). */
function timingSliders() {
  const enter = within(screen.getByRole('region', { name: 'Enter' }));
  return {
    duration: enter.getByLabelText('Duration') as HTMLInputElement,
    delay: enter.getByLabelText('Delay') as HTMLInputElement,
  };
}

describe('AnimationInspector preset timing range', () => {
  afterEach(() => {
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
    useWorkspaceStore.setState({
      openTabIds: [],
      activeProjectId: null,
      modeByProject: {},
    });
    animationPlaybackStore.getState().stopAndReset();
  });

  it('lets a preset run well past 4000 ms when the scene is long', async () => {
    await renderInspector(20_000);
    const { duration, delay } = timingSliders();
    expect(Number(duration.max)).toBe(20_000);
    expect(Number(delay.max)).toBe(20_000 - 1200);
    // Long scenes step coarsely so the slider stays draggable end to end.
    expect(Number(duration.step)).toBe(100);
  });

  it('keeps duration and delay together inside a short scene', async () => {
    await renderInspector(3000, { duration: 1000, delay: 800 });
    const { duration, delay } = timingSliders();
    // Each knob leaves room for the other, so no drag can commit a window that
    // overruns the scene (which the command layer would reject silently).
    expect(Number(duration.max)).toBe(3000 - 800);
    expect(Number(delay.max)).toBe(3000 - 1000);
    expect(Number(duration.step)).toBe(50);
  });
});
