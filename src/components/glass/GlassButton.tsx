import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'glass' | 'primary' | 'ghost';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  'inline-flex items-center justify-center gap-2 select-none whitespace-nowrap ' +
  'rounded-[var(--calqo-radius-sm)] px-3 h-8 text-[13px] font-medium ' +
  'transition-[transform,background,box-shadow] duration-[var(--calqo-t-fast)] ' +
  'ease-[var(--calqo-ease-spring)] active:scale-[0.97] ' +
  'disabled:opacity-40 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  glass:
    'glass text-[var(--calqo-text)] hover:bg-[var(--calqo-glass-strong)]',
  primary:
    'text-[var(--calqo-text-on-accent)] ' +
    'bg-[linear-gradient(180deg,var(--calqo-accent),var(--calqo-accent-strong))] ' +
    'shadow-[0_4px_14px_var(--calqo-accent-ring)] hover:brightness-105',
  ghost:
    'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
};

/** Pill button. `primary` is the only solid-accent fill in the chrome. */
export function GlassButton({
  variant = 'glass',
  className,
  children,
  ...rest
}: GlassButtonProps) {
  return (
    <button className={cn(base, variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}
