import { useRef, useState } from 'react';
import { ColorPickerPopover } from './ColorPickerPopover';

/**
 * A single colour swatch that opens the shared liquid-glass colour picker.
 * Use this anywhere a compact, on-brand colour control is needed instead of a
 * native `<input type="color">`.
 */
export function ColorSwatchButton({
  value,
  onChange,
  label,
  size = 28,
  className,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  size?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'shrink-0 rounded-[8px] border border-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] hover:scale-[1.08]',
          open ? 'ring-2 ring-[var(--calqo-accent-ring)]' : '',
          className ?? '',
        ].join(' ')}
        style={{ width: size, height: size, background: value }}
      />
      <ColorPickerPopover
        open={open}
        anchorRef={ref}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
