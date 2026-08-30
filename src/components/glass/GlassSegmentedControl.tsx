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
  /** Appended to the tooltip to explain what picking the segment does. */
  hint?: string;
}

interface GlassSegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  /** Keep the compact icon at narrow widths and reveal its label on desktop. */
  showLabels?: boolean;
}

/** One-of-N segmented control. The active segment uses the solid accent fill —
 * the same treatment macOS menus use for selection. */
export function GlassSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  showLabels = false,
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
        const tooltip = opt.hint
          ? `${opt.label} — ${opt.hint}`
          : iconOnly
            ? opt.label
            : undefined;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={
              !opt.disabled &&
              (active ||
                (!options.some(
                  (option) => option.value === value && !option.disabled,
                ) &&
                  options.find((option) => !option.disabled)?.value ===
                    opt.value))
                ? 0
                : -1
            }
            disabled={opt.disabled}
            aria-label={iconOnly ? opt.label : undefined}
            title={opt.disabledReason ?? tooltip}
            onClick={() => onChange(opt.value)}
            onKeyDown={(event) => {
              const keys = [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
              ];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const enabled = options.filter((option) => !option.disabled);
              const index = enabled.findIndex(
                (option) => option.value === opt.value,
              );
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? enabled.length - 1
                    : (index +
                        (event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                          ? -1
                          : 1) +
                        enabled.length) %
                      enabled.length;
              const option = enabled[next];
              if (!option) return;
              onChange(option.value);
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  'button:not(:disabled)',
                );
              buttons?.[next]?.focus();
            }}
            className={cn(
              'flex items-center justify-center rounded-[6px] h-6 text-[11.5px] font-medium',
              iconOnly
                ? showLabels
                  ? 'w-7 min-[1180px]:w-auto min-[1180px]:gap-1.5 min-[1180px]:px-2.5'
                  : 'w-7'
                : 'px-2.5',
              'transition-colors duration-[var(--calqo-t-fast)]',
              opt.disabled && 'cursor-not-allowed opacity-45',
              active
                ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                : 'text-[var(--calqo-text-2)] enabled:hover:text-[var(--calqo-text)]',
            )}
          >
            {opt.icon ?? opt.label}
            {iconOnly && showLabels && (
              <span className="hidden min-[1180px]:inline">{opt.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
