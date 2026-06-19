import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MousePointer2,
  Hand,
  Type,
  Square,
  Circle,
  Diamond,
  Minus,
  MoveUpRight,
  PenTool,
  Brush,
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
  group: 'navigation' | 'drawing' | 'shapes' | 'freeform';
  shortcut?: string;
}

/** Polygon shapes share one rail slot with a flyout — they are variations on
 * the same "place a polygon" action. */
const POLYGON_TOOLS: { id: EditorTool; icon: LucideIcon }[] = [
  { id: 'triangle', icon: Triangle },
  { id: 'diamond', icon: Diamond },
  { id: 'star', icon: Star },
  { id: 'badge', icon: Badge },
];
const POLYGON_IDS = new Set<EditorTool>(POLYGON_TOOLS.map((tool) => tool.id));

const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, group: 'navigation', shortcut: 'V' },
  { id: 'pan', icon: Hand, group: 'navigation', shortcut: 'H' },
  { id: 'text', icon: Type, group: 'drawing', shortcut: 'T' },
  { id: 'rect', icon: Square, group: 'drawing', shortcut: 'R' },
  { id: 'ellipse', icon: Circle, group: 'drawing', shortcut: 'E' },
  { id: 'line', icon: Minus, group: 'drawing', shortcut: 'L' },
  { id: 'arrow', icon: MoveUpRight, group: 'drawing', shortcut: 'A' },
  { id: 'pen', icon: PenTool, group: 'freeform', shortcut: 'P' },
  { id: 'brush', icon: Brush, group: 'freeform', shortcut: 'B' },
  { id: 'image', icon: ImageIcon, group: 'freeform', shortcut: 'I' },
  { id: 'svg', icon: Shapes, group: 'freeform' },
];

/** Vertical tool rail; tool selection drives the canvas and inspector. */
export function ToolRail() {
  const { t } = useTranslation('editor');
  const active = useUiStore((s) => s.activeTool);
  const setActive = useUiStore((s) => s.setActiveTool);
  const setSvgDialog = useUiStore((s) => s.setSvgDialog);

  // The SVG tool opens the insert dialog (library / AI / upload) rather than
  // arming a canvas placement mode.
  const handleSelect = (tool: EditorTool) => {
    if (tool === 'svg') {
      setSvgDialog(true);
      return;
    }
    setActive(tool);
  };

  // Render the drawing group first, then the polygon flyout, then freeform —
  // the polygon slot sits between them as its own divided section.
  const navigation = TOOLS.filter((tool) => tool.group === 'navigation');
  const drawing = TOOLS.filter((tool) => tool.group === 'drawing');
  const freeform = TOOLS.filter((tool) => tool.group === 'freeform');

  const renderTool = (tool: ToolDef) => {
    const Icon = tool.icon;
    return (
      <GlassIconButton
        key={tool.id}
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
        onClick={() => handleSelect(tool.id)}
      >
        <Icon size={18} />
      </GlassIconButton>
    );
  };

  const divider = <span className="my-1 h-px w-6 bg-[var(--calqo-divider)]" />;

  return (
    <nav
      aria-label={t('tools.select')}
      className="glass panel-anim relative z-40 m-1.5 flex flex-col items-center gap-1 overflow-visible p-2"
    >
      {navigation.map(renderTool)}
      {divider}
      {drawing.map(renderTool)}
      <PolygonToolButton active={active} setActive={setActive} />
      {divider}
      {freeform.map(renderTool)}
    </nav>
  );
}

/** A single rail slot for triangle / diamond / star / badge. Shows the last
 * picked shape and opens a flyout to switch between them. */
function PolygonToolButton({
  active,
  setActive,
}: {
  active: EditorTool;
  setActive: (tool: EditorTool) => void;
}) {
  const { t } = useTranslation('editor');
  const [shape, setShape] = useState<EditorTool>('triangle');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isGroupActive = POLYGON_IDS.has(active);
  // Keep the rail icon in sync if the active tool changed elsewhere (e.g. a
  // shortcut or a generated template).
  useEffect(() => {
    if (isGroupActive && active !== shape) setShape(active);
  }, [active, isGroupActive, shape]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const choose = (next: EditorTool) => {
    setShape(next);
    setActive(next);
    setOpen(false);
  };

  const ActiveIcon = POLYGON_TOOLS.find((tool) => tool.id === shape)?.icon ?? Triangle;

  return (
    <div ref={wrapperRef} className="relative">
      <GlassIconButton
        label={t('tools.shapes')}
        tooltipPlacement="right"
        size={36}
        active={isGroupActive}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tool="polygon-group"
        className={
          isGroupActive
            ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)] shadow-[0_4px_14px_var(--calqo-accent-ring)]'
            : undefined
        }
        onClick={() => {
          setActive(shape);
          setOpen((value) => !value);
        }}
      >
        <ActiveIcon size={18} />
      </GlassIconButton>
      {/* Corner caret hints that this slot holds a group of shapes. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1 right-1 h-0 w-0 border-b-[4px] border-l-[4px] border-b-current border-l-transparent opacity-50"
      />
      {open && (
        <div
          role="menu"
          className="glass glass-strong absolute left-[calc(100%+8px)] top-0 z-50 flex gap-1 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
        >
          {POLYGON_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <GlassIconButton
                key={tool.id}
                label={t(`tools.${tool.id}`)}
                tooltipPlacement="top"
                size={36}
                active={active === tool.id}
                role="menuitem"
                data-tool={tool.id}
                className={
                  active === tool.id
                    ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)] shadow-[0_4px_14px_var(--calqo-accent-ring)]'
                    : undefined
                }
                onClick={() => choose(tool.id)}
              >
                <Icon size={18} />
              </GlassIconButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
