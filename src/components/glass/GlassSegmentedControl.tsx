import { cn } from '@/lib/utils/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
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
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-[6px] px-2.5 h-6 text-[11.5px] font-medium',
              'transition-colors duration-[var(--calqo-t-fast)]',
              active
                ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                : 'text-[var(--calqo-text-2)] hover:text-[var(--calqo-text)]',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
