import { afterEach, describe, expect, it } from 'vitest';
import {
  addSceneToClip,
  moveScene,
  removeSceneFromClip,
  setClipScenes,
  setSceneTransition,
  undoProject,
} from '@/editor/commands/projectCommands';
import { createDefaultProject, type CalqoProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';

function setup(): CalqoProject {
  const project = createDefaultProject();
  const base = project.artboards[0];
  // Two more artboards of the same size so scenes are dimensionally valid.
  project.artboards.push({ ...base, id: 'ab2', name: 'Two', layers: [] });
  project.artboards.push({ ...base, id: 'ab3', name: 'Three', layers: [] });
  project.artboards[0].timing = { duration: 2000 };
  project.artboards[1].timing = { duration: 2000 };
  project.artboards[2].timing = { duration: 2000 };
  projectStore.getState().upsertProject(project);
  return project;
}

function scenes(projectId: string) {
  return projectStore.getState().projects[projectId].clipSettings?.scenes ?? [];
}

describe('scene sequencing commands (AN-4.2d)', () => {
  afterEach(() => {
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({ activeArtboardId: null, selectedLayerIds: [], hoveredLayerId: null });
  });

  it('adds, orders, retimes, and removes scenes', () => {
    const p = setup();
    const a = p.artboards[0].id;
    expect(addSceneToClip(p.id, a).ok).toBe(true);
    expect(addSceneToClip(p.id, 'ab2').ok).toBe(true);
    expect(addSceneToClip(p.id, 'ab3').ok).toBe(true);
    expect(scenes(p.id).map((s) => s.artboardId)).toEqual([a, 'ab2', 'ab3']);

    expect(setSceneTransition(p.id, 1, 'fade', 400).ok).toBe(true);
    expect(scenes(p.id)[1]).toMatchObject({ transition: 'fade', transitionDurationMs: 400 });

    expect(moveScene(p.id, 2, 0).ok).toBe(true);
    expect(scenes(p.id).map((s) => s.artboardId)).toEqual(['ab3', a, 'ab2']);

    expect(removeSceneFromClip(p.id, 0).ok).toBe(true);
    expect(scenes(p.id).map((s) => s.artboardId)).toEqual([a, 'ab2']);
  });

  it('rejects an invalid scene list without mutating the document', () => {
    const p = setup();
    addSceneToClip(p.id, p.artboards[0].id);
    const before = scenes(p.id);
    const result = setClipScenes(p.id, [{ artboardId: 'missing' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe('unknown-artboard');
    expect(scenes(p.id)).toEqual(before);
  });

  it('clears the clip when set to an empty list', () => {
    const p = setup();
    addSceneToClip(p.id, p.artboards[0].id);
    expect(setClipScenes(p.id, []).ok).toBe(true);
    expect(scenes(p.id)).toHaveLength(0);
  });

  it('records undoable steps', () => {
    const p = setup();
    addSceneToClip(p.id, p.artboards[0].id);
    addSceneToClip(p.id, 'ab2');
    expect(scenes(p.id)).toHaveLength(2);
    undoProject(p.id);
    expect(scenes(p.id)).toHaveLength(1);
  });
});
