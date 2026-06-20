import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/app/shell/useFocusTrap';

const TRANSITION_MS = 220;

interface ModalOverlayProps {
  open: boolean;
  onClose: () => void;
  /** id of the heading element that titles the dialog. */
  labelledBy?: string;
  ariaLabel?: string;
  /** Classes for the inner dialog card (glass recipe, sizing, padding). */
  className?: string;
  children: ReactNode;
}

/** Shared modal scaffold: a light scrim plus a fade/scale/slide entrance and
 * exit, mirroring GeoCarto's dialog feel. Portals to the body, traps focus, and
 * closes on backdrop click or Escape. Each modal supplies its own glass styling
 * via `className`; the entrance/exit and scrim live here so every dialog matches. */
export function ModalOverlay({
  open,
  onClose,
  labelledBy,
  ariaLabel,
  className = '',
  children,
}: ModalOverlayProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Commit the closed style before flipping to open so the entrance animates.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useFocusTrap(dialogRef, mounted && open, onClose);

  if (!mounted) return null;

  return createPortal(
    <div
      className={[
        'fixed inset-0 z-50 grid place-items-center p-6',
        'bg-[var(--calqo-scrim)] backdrop-blur-[2px]',
        'transition-opacity duration-200 ease-out motion-reduce:transition-none',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={[
          'transition-[opacity,transform] duration-[220ms] ease-out',
          'motion-reduce:transition-none motion-reduce:transform-none',
          visible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-[0.98] translate-y-1',
          className,
        ].join(' ')}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
