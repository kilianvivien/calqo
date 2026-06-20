import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/app/shell/useFocusTrap';
import { cn } from '@/lib/utils/cn';

const TRANSITION_MS = 240;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Sheet heading. */
  title: ReactNode;
  /** Optional supporting line under the title. */
  subtitle?: ReactNode;
  /** Pinned action row at the bottom (e.g. Apply / Cancel). */
  footer?: ReactNode;
  /** Extra classes for the scrolling body region. */
  bodyClassName?: string;
  children: ReactNode;
}

/** Touch-first modal surface: a glass card that slides up from the bottom edge,
 * the phone analogue of the desktop {@link ModalOverlay}. Portals to the body,
 * traps focus, closes on backdrop tap / Escape / the close button, and honours
 * reduced-motion and reduced-transparency through the shared `.glass` recipe. */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  footer,
  bodyClassName,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
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

  useFocusTrap(sheetRef, mounted && open, onClose);

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[60] flex flex-col justify-end',
        'bg-[var(--calqo-scrim)] backdrop-blur-[2px]',
        'transition-opacity duration-200 ease-out motion-reduce:transition-none',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'glass glass-strong',
          'flex max-h-[85vh] w-full flex-col',
          'rounded-t-[22px] border-x-0 border-b-0 border-t border-[var(--calqo-divider)]',
          'pb-[max(env(safe-area-inset-bottom),12px)]',
          'shadow-[0_-16px_60px_rgba(0,0,0,0.32)]',
          'transition-transform duration-[240ms] ease-out',
          'motion-reduce:transition-none motion-reduce:transform-none',
          visible ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5">
          <span
            aria-hidden
            className="h-1 w-9 rounded-full bg-[var(--calqo-divider)]"
          />
        </div>
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-2">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold text-[var(--calqo-text)]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[12.5px] text-[var(--calqo-text-3)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 -mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
          >
            <X size={18} />
          </button>
        </header>
        <div
          className={cn(
            'calqo-scroll min-h-0 flex-1 overflow-y-auto px-4',
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--calqo-divider)] px-4 pt-3">
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}
