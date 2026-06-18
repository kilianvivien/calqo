import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  MousePointer2,
  Hand,
  Type,
  Square,
  Circle,
  Minus,
  Image as ImageIcon,
  Shapes,
  type LucideIcon,
} from 'lucide-react';
import { GlassIconButton } from '@/components/glass';
import { useUiStore, type EditorTool } from '@/lib/state/uiStore';

interface ToolDef {
  id: EditorTool;
  icon: LucideIcon;
  group: 'navigation' | 'drawing';
  shortcut?: string;
}

interface TooltipState {
  label: string;
  shortcut?: string;
  top: number;
  left: number;
}

const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, group: 'navigation', shortcut: 'V' },
  { id: 'pan', icon: Hand, group: 'navigation', shortcut: 'H' },
  { id: 'text', icon: Type, group: 'drawing', shortcut: 'T' },
  { id: 'rect', icon: Square, group: 'drawing', shortcut: 'R' },
  { id: 'ellipse', icon: Circle, group: 'drawing', shortcut: 'E' },
  { id: 'line', icon: Minus, group: 'drawing', shortcut: 'L' },
  { id: 'image', icon: ImageIcon, group: 'drawing', shortcut: 'I' },
  { id: 'svg', icon: Shapes, group: 'drawing' },
];

/** Vertical tool rail; tool selection drives the canvas and inspector. */
export function ToolRail() {
  const { t } = useTranslation('editor');
  const active = useUiStore((s) => s.activeTool);
  const setActive = useUiStore((s) => s.setActiveTool);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showTooltip = (target: HTMLElement, tool: ToolDef) => {
    const rect = target.getBoundingClientRect();
    setTooltip({
      label: t(`tools.${tool.id}`),
      shortcut: tool.shortcut,
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
  };

  return (
    <>
      <nav
        aria-label={t('tools.select')}
        className="glass panel-anim relative z-40 m-1.5 flex flex-col items-center gap-1 overflow-visible p-2"
      >
        {TOOLS.map((tool, i) => {
          const prev = TOOLS[i - 1];
          const dividerBefore = prev && prev.group !== tool.group;
          const Icon = tool.icon;
          return (
            <div key={tool.id} className="contents">
              {dividerBefore && (
                <span className="my-1 h-px w-6 bg-[var(--calqo-divider)]" />
              )}
              <div
                className="relative"
                onPointerEnter={(event) => showTooltip(event.currentTarget, tool)}
                onPointerLeave={() => setTooltip(null)}
                onFocus={(event) => showTooltip(event.currentTarget, tool)}
                onBlur={() => setTooltip(null)}
              >
                <GlassIconButton
                  label={t(`tools.${tool.id}`)}
                  showTitle={false}
                  size={36}
                  active={active === tool.id}
                  data-tool={tool.id}
                  className={
                    active === tool.id
                      ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)] shadow-[0_4px_14px_var(--calqo-accent-ring)]'
                      : undefined
                  }
                  onClick={() => setActive(tool.id)}
                >
                  <Icon size={18} />
                </GlassIconButton>
              </div>
            </div>
          );
        })}
      </nav>
      {tooltip && typeof document !== 'undefined'
        ? createPortal(<ToolTooltip tooltip={tooltip} />, document.body)
        : null}
    </>
  );
}

function ToolTooltip({ tooltip }: { tooltip: TooltipState }) {
  return (
    <div
      role="tooltip"
      className="glass pointer-events-none fixed z-[200] flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-[12px] border border-[var(--calqo-divider)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--calqo-text)] opacity-100 shadow-[0_10px_32px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
      style={{ top: tooltip.top, left: tooltip.left }}
    >
      {tooltip.label}
      {tooltip.shortcut && (
        <kbd className="mono rounded-[5px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--calqo-text-3)]">
          {tooltip.shortcut}
        </kbd>
      )}
    </div>
  );
}
