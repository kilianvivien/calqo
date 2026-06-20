import { useTranslation } from 'react-i18next';
import {
  Brush,
  Circle,
  Image as ImageIcon,
  List,
  Minus,
  Shapes,
  Square,
  Triangle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { BottomSheet } from '@/components/mobile';

/** What the add sheet can insert: text, list, basic shapes, an image or SVG
 * from the device, or the freehand brush. */
export type AddKind =
  | 'text'
  | 'list'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'image'
  | 'svg'
  | 'brush';

interface AddSheetProps {
  open: boolean;
  onClose: () => void;
  onInsert: (kind: AddKind) => void;
}

const ITEMS: { kind: AddKind; icon: LucideIcon; labelKey: string }[] = [
  { kind: 'text', icon: Type, labelKey: 'tools.text' },
  { kind: 'list', icon: List, labelKey: 'tools.list' },
  { kind: 'image', icon: ImageIcon, labelKey: 'tools.image' },
  { kind: 'svg', icon: Shapes, labelKey: 'tools.svg' },
  { kind: 'brush', icon: Brush, labelKey: 'tools.brush' },
  { kind: 'rect', icon: Square, labelKey: 'tools.rect' },
  { kind: 'ellipse', icon: Circle, labelKey: 'tools.ellipse' },
  { kind: 'triangle', icon: Triangle, labelKey: 'tools.triangle' },
  { kind: 'line', icon: Minus, labelKey: 'tools.line' },
];

/** Insert an element onto the canvas — the phone counterpart to the desktop
 * tool rail, scoped to text, list, and basic shapes. */
export function AddSheet({ open, onClose, onInsert }: AddSheetProps) {
  const { t } = useTranslation('editor');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.add.title')}
      bodyClassName="pb-4"
    >
      <div className="grid grid-cols-3 gap-2 pt-1">
        {ITEMS.map(({ kind, icon: Icon, labelKey }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onInsert(kind)}
            className="flex flex-col items-center justify-center gap-2 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] py-5 text-[var(--calqo-text-2)] transition-colors active:bg-[var(--calqo-hover)]"
          >
            <Icon size={24} />
            <span className="text-[12px] font-medium">{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
