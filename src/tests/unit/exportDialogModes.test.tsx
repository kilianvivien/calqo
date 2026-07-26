import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExportDialog } from '@/app/shell/ExportDialog';
import { createDefaultProject } from '@/lib/schema';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { useWorkspaceStore, type WorkspaceMode } from '@/lib/state/workspaceStore';

async function renderDialog(mode: WorkspaceMode) {
  const project = createDefaultProject();
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
  useWorkspaceStore.setState({
    openTabIds: [project.id],
    activeProjectId: project.id,
    modeByProject: { [project.id]: mode },
  });
  await act(async () => {
    render(<ExportDialog open onClose={() => undefined} />);
  });
}

describe('ExportDialog mode-specific formats', () => {
  afterEach(() => {
    projectStore.setState({ projects: {}, saveState: {} });
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
  });

  it('shows only static formats in Design mode', async () => {
    await renderDialog('design');

    expect(screen.getByRole('radio', { name: 'PNG' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'JPG' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'WebP' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'SVG' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'HTML' })).toBeEnabled();
    expect(screen.queryByRole('radio', { name: 'MP4' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'GIF' })).not.toBeInTheDocument();
  });

  it('shows disabled animation formats with guidance when nothing is animated', async () => {
    await renderDialog('animate');

    expect(screen.getByRole('radio', { name: 'MP4' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'GIF' })).toBeDisabled();
    expect(screen.queryByRole('radio', { name: 'PNG' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Please add an animation to a layer before exporting.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});
