import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Use the stronger, more opaque glass tint (window-level surfaces, modals). */
  strong?: boolean;
  /** Run the subtle entrance animation on mount. */
  animate?: boolean;
}

/** The base floating surface — the four-layer liquid-glass recipe in component
 * form. Everything that floats over the canvas builds on this. */
export function GlassPanel({
  strong = false,
  animate = false,
  className,
  children,
  ...rest
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        'glass',
        strong && 'glass-strong',
        animate && 'panel-anim',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
