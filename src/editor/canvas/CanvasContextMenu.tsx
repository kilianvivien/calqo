import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Group as GroupIcon, Trash2, Ungroup } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface CanvasContextMenuProps {
  /** Position within the canvas container, in pixels. */
  x: number;
  y: number;
  canGroup: boolean;
  canUngroup: boolean;
  hasSelection: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  enabled: boolean;
  danger?: boolean;
  run: () => void;
}

/** Right-click menu over the canvas: group / ungroup the current selection,
 * plus duplicate and delete (GeoCarto's canvas context menu, §6c). Rendered as
 * an HTML overlay positioned at the cursor, clamped to the container edges. */
export function CanvasContextMenu({
  x,
  y,
  canGroup,
  canUngroup,
  hasSelection,
  onGroup,
  onUngroup,
  onDuplicate,
  onDelete,
  onClose,
}: CanvasContextMenuProps) {
  const { t } = useTranslation('editor');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp into the container so the menu never spills off the right/bottom edge.
  const container = menuRef.current?.parentElement;
  const maxX = (container?.clientWidth ?? Infinity) - 180;
  const maxY = (container?.clientHeight ?? Infinity) - 160;
  const left = Math.max(8, Math.min(x, maxX));
  const top = Math.max(8, Math.min(y, maxY));

  const items: MenuItem[] = [
    {
      key: 'group',
      label: t('layersPanel.group'),
      icon: GroupIcon,
      shortcut: '⌘G',
      enabled: canGroup,
      run: onGroup,
    },
    {
      key: 'ungroup',
      label: t('layersPanel.ungroup'),
      icon: Ungroup,
      shortcut: '⇧⌘G',
      enabled: canUngroup,
      run: onUngroup,
    },
    {
      key: 'duplicate',
      label: t('layersPanel.duplicate'),
      icon: Copy,
      shortcut: '⌘D',
      enabled: hasSelection,
      run: onDuplicate,
    },
    {
      key: 'delete',
      label: t('layersPanel.deleteSelected'),
      icon: Trash2,
      enabled: hasSelection,
      danger: true,
      run: onDelete,
    },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      className="glass glass-strong absolute z-50 flex w-44 flex-col gap-0.5 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
      style={{ left, top }}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const divider = item.key === 'duplicate';
        return (
          <div key={item.key}>
            {divider && index > 0 && (
              <span className="my-1 block h-px w-full bg-[var(--calqo-divider)]" />
            )}
            <button
              type="button"
              role="menuitem"
              disabled={!item.enabled}
              className={`flex w-full items-center gap-2 rounded-[var(--calqo-radius-xs)] px-2 py-1.5 text-left text-[12.5px] transition-colors enabled:hover:bg-[var(--calqo-hover)] disabled:cursor-default disabled:opacity-35 ${
                item.danger ? 'text-[#E5484D]' : 'text-[var(--calqo-text)]'
              }`}
              onClick={() => {
                if (!item.enabled) return;
                item.run();
                onClose();
              }}
            >
              <Icon size={14} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <kbd className="text-[10.5px] text-[var(--calqo-text-3)]">{item.shortcut}</kbd>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
