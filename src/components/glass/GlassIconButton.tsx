import { useId, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

interface GlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Sticky-toggle pressed state — accent-soft fill + accent icon. */
  active?: boolean;
  /** Accessible label; also drives the glass tooltip. */
  label: string;
  size?: number;
  /** Render the floating liquid-glass tooltip on hover/focus. */
  showTitle?: boolean;
  /** Optional shortcut chip shown inside the tooltip. */
  shortcut?: string;
  /** Where the tooltip floats relative to the button. */
  tooltipPlacement?: 'bottom' | 'right' | 'top';
}

interface TipState {
  top: number;
  left: number;
  transform: string;
}

/** Square icon button used across the title bar, tool rail, and panels, with a
 * built-in liquid-glass tooltip (replaces the native title bubble). */
export function GlassIconButton({
  active = false,
  label,
  size = 28,
  showTitle = true,
  shortcut,
  tooltipPlacement = 'bottom',
  className,
  children,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...rest
}: GlassIconButtonProps) {
  const [tip, setTip] = useState<TipState | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  const open = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (tooltipPlacement === 'right') {
      setTip({ top: r.top + r.height / 2, left: r.right + 8, transform: 'translateY(-50%)' });
    } else if (tooltipPlacement === 'top') {
      setTip({ top: r.top - 8, left: r.left + r.width / 2, transform: 'translate(-50%, -100%)' });
    } else {
      setTip({ top: r.bottom + 8, left: r.left + r.width / 2, transform: 'translateX(-50%)' });
    }
  };
  const close = () => setTip(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-describedby={tip ? tooltipId : undefined}
        aria-pressed={active}
        style={{ width: size, height: size }}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--calqo-radius-sm)]',
          'transition-[transform,background,color] duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)]',
          'hover:scale-[1.05] active:scale-[0.94]',
          active
            ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
            : 'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
          className,
        )}
        onPointerEnter={(e) => {
          if (showTitle) open();
          onPointerEnter?.(e);
        }}
        onPointerLeave={(e) => {
          close();
          onPointerLeave?.(e);
        }}
        onFocus={(e) => {
          if (showTitle) open();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          close();
          onBlur?.(e);
        }}
        {...rest}
      >
        {children}
      </button>
      {showTitle && tip && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="glass pointer-events-none fixed z-[200] flex items-center gap-2 whitespace-nowrap rounded-[12px] border border-[var(--calqo-divider)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--calqo-text)] shadow-[0_10px_32px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
              style={{ top: tip.top, left: tip.left, transform: tip.transform }}
            >
              {label}
              {shortcut && (
                <kbd className="mono rounded-[5px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--calqo-text-3)]">
                  {shortcut}
                </kbd>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
