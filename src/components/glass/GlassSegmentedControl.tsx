import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Shown as a tooltip when the segment is unavailable. */
  disabledReason?: string;
  /** When set, the segment shows this icon instead of the text; `label` stays
   * the accessible name (aria-label + tooltip). */
  icon?: ReactNode;
}

interface GlassSegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}

/** One-of-N segmented control. The active segment uses the solid accent fill —
 * the same treatment macOS menus use for selection. */
export function GlassSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: GlassSegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'glass-thin inline-flex gap-0.5 rounded-[var(--calqo-radius-sm)] p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const iconOnly = opt.icon != null;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            aria-label={iconOnly ? opt.label : undefined}
            title={opt.disabledReason ?? (iconOnly ? opt.label : undefined)}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center justify-center rounded-[6px] h-6 text-[11.5px] font-medium',
              iconOnly ? 'w-7' : 'px-2.5',
              'transition-colors duration-[var(--calqo-t-fast)]',
              opt.disabled && 'cursor-not-allowed opacity-45',
              active
                ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                : 'text-[var(--calqo-text-2)] enabled:hover:text-[var(--calqo-text)]',
            )}
          >
            {opt.icon ?? opt.label}
          </button>
        );
      })}
    </div>
  );
}
