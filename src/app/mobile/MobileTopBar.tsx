import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface MobileTopBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** Right-aligned action controls. */
  actions?: ReactNode;
}

/** The phone shell's top chrome row: an optional back affordance, the current
 * context title, and trailing actions. Sits above the safe-area inset. */
export function MobileTopBar({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  actions,
}: MobileTopBarProps) {
  return (
    <header
      className={cn(
        'glass glass-strong',
        'flex shrink-0 items-center gap-2',
        'rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)]',
        'px-2 py-2',
      )}
    >
      {onBack && (
        <button
          type="button"
          aria-label={backLabel}
          onClick={onBack}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--calqo-text-2)] transition-colors active:bg-[var(--calqo-hover)]"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div className={cn('min-w-0 flex-1', !onBack && 'pl-1.5')}>
        <p className="truncate text-[14px] font-semibold text-[var(--calqo-text)]">
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-[11px] text-[var(--calqo-text-3)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}
