import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface MobileToolItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
  onClick: () => void;
  disabled?: boolean;
  /** Render in the accent colour to signal the primary action in context. */
  accent?: boolean;
}

/** A finger-sized icon+label button for the contextual toolbar. The 44px hit
 * target meets the touch-size floor in the cross-phase accessibility notes. */
export function MobileToolButton({
  item,
  fill = false,
}: {
  item: MobileToolItem;
  fill?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onClick}
      disabled={item.disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-1',
        fill ? 'min-w-0' : 'min-w-[60px] shrink-0',
        'min-h-[52px] rounded-[var(--calqo-radius-sm)] px-1.5 py-1.5',
        'text-[10.5px] font-medium',
        'transition-[transform,background-color,color] duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)]',
        'disabled:opacity-35',
        item.accent
          ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
          : 'text-[var(--calqo-text-2)] enabled:active:bg-[var(--calqo-hover)]',
        'enabled:active:scale-95',
      )}
    >
      <span className="grid h-5 w-5 place-items-center">
        <Icon size={18} />
      </span>
      <span className="max-w-full truncate leading-none">{item.label}</span>
    </button>
  );
}

/** Scrollable contextual toolbar of per-selection actions. Horizontal (pinned
 * above the safe area) in portrait; a vertical rail in landscape, where it sits
 * beside the canvas instead of stealing scarce vertical space. */
export function MobileToolbar({
  items,
  children,
  vertical = false,
}: {
  items?: MobileToolItem[];
  children?: ReactNode;
  vertical?: boolean;
}) {
  const itemCount = items?.length ?? 0;
  const fillRow = !vertical && itemCount > 0 && itemCount <= 6;
  const fadeStyle =
    !fillRow && !vertical
      ? {
          WebkitMaskImage:
            'linear-gradient(to right, #000 calc(100% - 34px), transparent)',
          maskImage: 'linear-gradient(to right, #000 calc(100% - 34px), transparent)',
        }
      : undefined;
  // Match the column count to the actual item count so a row with fewer than
  // 6 items still spans the full width instead of leaving a trailing gap.
  const gridStyle = fillRow
    ? { gridTemplateColumns: `repeat(${itemCount}, minmax(0, 1fr))` }
    : undefined;

  return (
    <div
      className={cn(
        'glass glass-strong',
        'rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)]',
        // The glass extends through the home-indicator safe area, but its bottom
        // padding keeps the buttons clear of it — so the bar reads as one surface
        // down to the screen edge without putting tap targets under the indicator.
        'overflow-hidden px-1.5 pt-1.5 pb-[max(env(safe-area-inset-bottom),6px)]',
        vertical && 'h-full',
      )}
    >
      <div
        className={cn(
        fillRow
          ? 'grid gap-1'
          : vertical
            ? 'calqo-scroll flex h-full flex-col items-stretch gap-1 overflow-y-auto'
            : 'calqo-scroll flex items-stretch gap-1 overflow-x-auto',
        )}
        style={fillRow ? gridStyle : fadeStyle}
      >
        {items?.map((item) => (
          <MobileToolButton key={item.id} item={item} fill={fillRow} />
        ))}
        {children}
      </div>
    </div>
  );
}
