import { useTranslation } from 'react-i18next';
import {
  MousePointer2,
  Hand,
  Type,
  Square,
  Circle,
  Diamond,
  Minus,
  Star,
  Triangle,
  Badge,
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

const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, group: 'navigation', shortcut: 'V' },
  { id: 'pan', icon: Hand, group: 'navigation', shortcut: 'H' },
  { id: 'text', icon: Type, group: 'drawing', shortcut: 'T' },
  { id: 'rect', icon: Square, group: 'drawing', shortcut: 'R' },
  { id: 'ellipse', icon: Circle, group: 'drawing', shortcut: 'E' },
  { id: 'line', icon: Minus, group: 'drawing', shortcut: 'L' },
  { id: 'triangle', icon: Triangle, group: 'drawing' },
  { id: 'diamond', icon: Diamond, group: 'drawing' },
  { id: 'badge', icon: Badge, group: 'drawing' },
  { id: 'star', icon: Star, group: 'drawing' },
  { id: 'image', icon: ImageIcon, group: 'drawing', shortcut: 'I' },
  { id: 'svg', icon: Shapes, group: 'drawing' },
];

/** Vertical tool rail; tool selection drives the canvas and inspector. */
export function ToolRail() {
  const { t } = useTranslation('editor');
  const active = useUiStore((s) => s.activeTool);
  const setActive = useUiStore((s) => s.setActiveTool);

  return (
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
            <GlassIconButton
              label={t(`tools.${tool.id}`)}
              shortcut={tool.shortcut}
              tooltipPlacement="right"
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
        );
      })}
    </nav>
  );
}
