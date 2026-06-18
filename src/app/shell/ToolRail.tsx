import { useState } from 'react';
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

type ToolId =
  | 'select'
  | 'pan'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'svg';

interface ToolDef {
  id: ToolId;
  icon: LucideIcon;
  group: 'navigation' | 'drawing';
}

const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, group: 'navigation' },
  { id: 'pan', icon: Hand, group: 'navigation' },
  { id: 'text', icon: Type, group: 'drawing' },
  { id: 'rect', icon: Square, group: 'drawing' },
  { id: 'ellipse', icon: Circle, group: 'drawing' },
  { id: 'line', icon: Minus, group: 'drawing' },
  { id: 'image', icon: ImageIcon, group: 'drawing' },
  { id: 'svg', icon: Shapes, group: 'drawing' },
];

/** Vertical tool rail. Tool selection is local placeholder state until the
 * canvas editor lands (Phase B). */
export function ToolRail() {
  const { t } = useTranslation('editor');
  const [active, setActive] = useState<ToolId>('select');

  return (
    <nav
      aria-label={t('tools.select')}
      className="glass panel-anim m-1.5 flex flex-col items-center gap-1 p-2"
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
              size={36}
              active={active === tool.id}
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
