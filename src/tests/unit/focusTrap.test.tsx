import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from '@/app/shell/useFocusTrap';

function FocusTrapRerenderFixture() {
  const rootRef = useRef<HTMLElement>(null);
  const [value, setValue] = useState('');
  const onClose = () => undefined;

  useFocusTrap(rootRef, true, onClose);

  return (
    <section ref={rootRef}>
      <button type="button">Close</button>
      <textarea
        aria-label="Prompt"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </section>
  );
}

describe('useFocusTrap', () => {
  it('does not steal focus back to the first button after typing rerenders a modal', () => {
    render(<FocusTrapRerenderFixture />);

    const close = screen.getByRole('button', { name: 'Close' });
    const prompt = screen.getByRole('textbox', { name: 'Prompt' });

    prompt.focus();
    expect(prompt).toHaveFocus();

    fireEvent.change(prompt, { target: { value: 't' } });

    expect(prompt).toHaveFocus();
    expect(close).not.toHaveFocus();
  });

  it('uses the latest escape handler without reinstalling the focus trap', () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    function EscapeFixture({ onClose }: { onClose: () => void }) {
      const rootRef = useRef<HTMLElement>(null);
      useFocusTrap(rootRef, true, onClose);
      return (
        <section ref={rootRef}>
          <button type="button">Close</button>
        </section>
      );
    }

    const { rerender } = render(<EscapeFixture onClose={firstClose} />);
    rerender(<EscapeFixture onClose={secondClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalledTimes(1);
  });
});
