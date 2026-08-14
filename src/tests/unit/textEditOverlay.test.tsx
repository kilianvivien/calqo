import { act, fireEvent, render, screen } from '@testing-library/react';
import type Konva from 'konva';
import { describe, expect, it, vi } from 'vitest';
import { TextEditOverlay } from '@/editor/canvas/TextEditOverlay';
import { createDefaultProject } from '@/lib/schema';
import { createTextLayer } from '@/editor/commands/projectCommands';

/** Minimal stand-in for the Konva text node the overlay measures itself
 * against: a stage with a DOM container, and a box in stage coordinates. */
function stubNode(): Konva.Node {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const stage = { container: () => container };
  return {
    getStage: () => stage,
    getClientRect: () => ({ x: 10, y: 20, width: 200, height: 40 }),
  } as unknown as Konva.Node;
}

function textStyle() {
  const layer = createTextLayer(createDefaultProject(), 0, 0);
  if (layer.type !== 'text') throw new Error('expected a text layer');
  return layer.style;
}

async function renderOverlay(
  overrides: Partial<Parameters<typeof TextEditOverlay>[0]> = {},
) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const node = stubNode();
  const props = {
    initialValue: 'Ouverte pour les demandes',
    textStyle: textStyle(),
    rotation: 0,
    node,
    stageScale: 1,
    onCommit,
    onCancel,
    ...overrides,
  };
  let rerender: (ui: React.ReactElement) => void = () => undefined;
  await act(async () => {
    ({ rerender } = render(<TextEditOverlay {...props} />));
  });
  const restyle = async (stageScale: number) => {
    await act(async () => {
      rerender(<TextEditOverlay {...props} stageScale={stageScale} />);
    });
  };
  return { onCommit, onCancel, restyle };
}

describe('TextEditOverlay', () => {
  it('focuses and selects its text once the box is measured', async () => {
    await renderOverlay();

    // Regression guard: the overlay renders nothing on its first pass (the box
    // is measured in an effect), so a mount-only focus effect ran against an
    // empty ref and never fired again. The overlay could then never blur, so
    // edit mode never committed and never ended.
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe('Ouverte pour les demandes'.length);
  });

  it('commits on blur, which is what ends edit mode when another layer is picked', async () => {
    const { onCommit } = await renderOverlay();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Bonjour Ankara' } });
      fireEvent.blur(textarea);
    });

    expect(onCommit).toHaveBeenCalledWith('Bonjour Ankara');
  });

  it('does not re-select the text when the box is re-measured mid-edit', async () => {
    const { restyle } = await renderOverlay();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(3, 3);

    // Zooming restyles the overlay. Focusing on every restyle instead of once
    // would select the whole value again and swallow the next keystroke.
    await restyle(2);

    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
  });

  it('cancels on Escape without committing', async () => {
    const { onCommit, onCancel } = await renderOverlay();
    const textarea = screen.getByRole('textbox');

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Escape' });
    });

    expect(onCancel).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
