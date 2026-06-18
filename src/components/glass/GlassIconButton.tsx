import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface GlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Sticky-toggle pressed state — accent-soft fill + accent icon. */
  active?: boolean;
  /** Accessible label; also drives the title tooltip. */
  label: string;
  size?: number;
}

/** Square icon button used across the title bar, tool rail, and panels. */
export function GlassIconButton({
  active = false,
  label,
  size = 28,
  className,
  children,
  ...rest
}: GlassIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
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
      {...rest}
    >
      {children}
    </button>
  );
}
