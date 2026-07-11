import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from 'react';
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
  /** Faded, non-actionable state that still shows its tooltip on hover — unlike
   * the native `disabled` attribute, which suppresses pointer events (and so the
   * explanatory tooltip). Use when the reason the action is unavailable is worth
   * surfacing. */
  softDisabled?: boolean;
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
  softDisabled = false,
  className,
  children,
  onClick,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...rest
}: GlassIconButtonProps) {
  const [tip, setTip] = useState<TipState | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
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

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tip || !tooltip) return;

    const rect = tooltip.getBoundingClientRect();
    const margin = 8;
    let nextTop = tip.top;
    let nextLeft = tip.left;

    if (tip.transform.includes('translateX')) {
      nextLeft = Math.min(
        Math.max(tip.left, rect.width / 2 + margin),
        window.innerWidth - rect.width / 2 - margin,
      );
    } else {
      nextLeft = Math.min(
        Math.max(tip.left, margin),
        window.innerWidth - rect.width - margin,
      );
    }

    if (tip.transform.includes('translateY')) {
      nextTop = Math.min(
        Math.max(tip.top, rect.height / 2 + margin),
        window.innerHeight - rect.height / 2 - margin,
      );
    } else if (tip.transform.includes('-100%')) {
      nextTop = Math.min(
        Math.max(tip.top, rect.height + margin),
        window.innerHeight - margin,
      );
    } else {
      nextTop = Math.min(
        Math.max(tip.top, margin),
        window.innerHeight - rect.height - margin,
      );
    }

    if (Math.abs(nextLeft - tip.left) > 0.5 || Math.abs(nextTop - tip.top) > 0.5) {
      setTip({ ...tip, left: nextLeft, top: nextTop });
    }
  }, [tip, label, shortcut]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-describedby={tip ? tooltipId : undefined}
        aria-pressed={active}
        aria-disabled={softDisabled || undefined}
        style={{ width: size, height: size }}
        className={cn(
          'touch-hitarea inline-flex items-center justify-center rounded-[var(--calqo-radius-sm)]',
          'transition-[transform,background,color] duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)]',
          softDisabled
            ? 'cursor-not-allowed opacity-40 text-[var(--calqo-text-2)]'
            : 'hover:scale-[1.05] active:scale-[0.94]',
          active
            ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
            : !softDisabled &&
                'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
          className,
        )}
        onClick={(e) => {
          if (softDisabled) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        onPointerEnter={(e) => {
          // No tooltip for finger taps — it would linger over the pressed
          // button. Pencil hover (pointerType 'pen') keeps it, like a mouse.
          if (showTitle && e.pointerType !== 'touch') open();
          onPointerEnter?.(e);
        }}
        onPointerLeave={(e) => {
          close();
          onPointerLeave?.(e);
        }}
        onFocus={(e) => {
          // Only on keyboard focus — not the programmatic focus a modal's focus
          // trap puts on its first button, which would flash the tooltip on open.
          if (showTitle && e.currentTarget.matches(':focus-visible')) open();
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
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="glass pointer-events-none fixed z-[200] flex max-w-[calc(100vw-16px)] items-center gap-2 whitespace-nowrap rounded-[12px] border border-[var(--calqo-divider)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--calqo-text)] shadow-[0_10px_32px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
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
