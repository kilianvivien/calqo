import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  setArtboardBackgroundColor,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import { createDefaultProject } from '@/lib/schema';
import { historyStore } from '@/lib/state/historyStore';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { usePhoneLayout } from '@/lib/hooks/useResponsiveMode';

function commit(project: ReturnType<typeof createDefaultProject>) {
  projectStore.getState().upsertProject(project);
  selectionStore.getState().setActiveArtboard(project.artboards[0].id);
}

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

describe('phase Q — mobile quick-edit', () => {
  afterEach(() => {
    vi.useRealTimers();
    projectStore.setState({ projects: {}, saveState: {} });
    historyStore.setState({ histories: {} });
    selectionStore.setState({
      activeArtboardId: null,
      selectedLayerIds: [],
      hoveredLayerId: null,
    });
  });

  it('sets a solid artboard background colour, replacing any prior fill', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    project.artboards[0].background = {
      type: 'linear',
      angle: 0,
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#FFFFFF' },
      ],
    };
    commit(project);

    setArtboardBackgroundColor(project.id, project.artboards[0].id, '#0A2540');

    const next = projectStore.getState().projects[project.id].artboards[0];
    expect(next.background).toEqual({ type: 'solid', color: '#0A2540' });
  });

  it('recolours a text layer through its style (phone color sheet path)', () => {
    vi.useFakeTimers();
    const project = createDefaultProject();
    const text = {
      id: 'txt1',
      name: 'Heading',
      type: 'text' as const,
      x: 0,
      y: 0,
      w: 200,
      h: 60,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      text: { en: 'Hi' },
      style: {
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 400,
        fontStyle: 'normal' as const,
        textDecoration: 'none' as const,
        color: '#000000',
        align: 'left' as const,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    };
    project.artboards[0].layers.push(text);
    commit(project);

    updateLayerInActiveArtboard(project.id, 'txt1', { style: { color: '#E8B339' } });

    const layer = projectStore.getState().projects[project.id].artboards[0].layers[0];
    expect(layer.type === 'text' && layer.style.color).toBe('#E8B339');
  });

  it('usePhoneLayout tracks the phone media query in the browser build', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePhoneLayout());
    expect(result.current).toBe(true);
  });

  it('usePhoneLayout is false on tablet/desktop widths', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePhoneLayout());
    expect(result.current).toBe(false);
  });
});
