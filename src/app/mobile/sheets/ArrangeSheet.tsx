import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import {
  alignSelectionToArtboard,
  nudgeSelectedLayers,
  shiftSelectionZOrder,
} from '@/editor/commands/projectCommands';
import type { AlignMode } from '@/editor/utils/arrange';
import type { CalqoProject } from '@/lib/schema';
import { useUiStore } from '@/lib/state/uiStore';
import { BottomSheet } from '@/components/mobile';
import { cn } from '@/lib/utils/cn';

interface ArrangeSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
}

function PadButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid h-12 w-12 place-items-center rounded-[var(--calqo-radius-sm)]',
        'border border-[var(--calqo-divider)] text-[var(--calqo-text-2)]',
        'active:bg-[var(--calqo-hover)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The align-to-canvas controls, paired with the icon and accessible label. */
const ALIGN_ACTIONS: { mode: AlignMode; icon: typeof AlignStartVertical; key: string }[] = [
  { mode: 'left', icon: AlignStartVertical, key: 'alignLeft' },
  { mode: 'center-h', icon: AlignCenterVertical, key: 'centerH' },
  { mode: 'right', icon: AlignEndVertical, key: 'alignRight' },
  { mode: 'top', icon: AlignStartHorizontal, key: 'alignTop' },
  { mode: 'middle', icon: AlignCenterHorizontal, key: 'centerV' },
  { mode: 'bottom', icon: AlignEndHorizontal, key: 'alignBottom' },
];

/** Fine-position and z-order controls for the current selection: a snap toggle,
 * a nudge pad (1px / 10px step), bring-forward / send-backward, and
 * align-to-canvas (PRD §5.9 "nudge", "reorder"). Coarse move/resize happen by
 * touch on the canvas itself. */
export function ArrangeSheet({ open, onClose, project }: ArrangeSheetProps) {
  const { t } = useTranslation('editor');
  const [coarse, setCoarse] = useState(false);
  const step = coarse ? 10 : 1;
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const setSnapEnabled = useUiStore((s) => s.setSnapEnabled);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.arrange.title')}
      bodyClassName="pb-4"
    >
      <div className="flex items-center justify-between py-1">
        <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
          {t('mobile.arrange.snap')}
        </span>
        <div className="flex gap-1 rounded-full bg-[var(--calqo-hover)] p-0.5">
          {[
            { value: true, label: t('mobile.arrange.on') },
            { value: false, label: t('mobile.arrange.off') },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setSnapEnabled(option.value)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                snapEnabled === option.value
                  ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                  : 'text-[var(--calqo-text-2)]',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between py-1">
        <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
          {t('mobile.arrange.step')}
        </span>
        <div className="flex gap-1 rounded-full bg-[var(--calqo-hover)] p-0.5">
          {[
            { value: false, label: t('mobile.arrange.fine') },
            { value: true, label: t('mobile.arrange.coarse') },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setCoarse(option.value)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                coarse === option.value
                  ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                  : 'text-[var(--calqo-text-2)]',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
          <span />
          <PadButton label={t('mobile.arrange.up')} onClick={() => nudgeSelectedLayers(project.id, 0, -step)}>
            <ChevronUp size={20} />
          </PadButton>
          <span />
          <PadButton label={t('mobile.arrange.left')} onClick={() => nudgeSelectedLayers(project.id, -step, 0)}>
            <ChevronLeft size={20} />
          </PadButton>
          <span className="grid place-items-center text-[11px] font-semibold text-[var(--calqo-text-3)]">
            {step}px
          </span>
          <PadButton label={t('mobile.arrange.right')} onClick={() => nudgeSelectedLayers(project.id, step, 0)}>
            <ChevronRight size={20} />
          </PadButton>
          <span />
          <PadButton label={t('mobile.arrange.down')} onClick={() => nudgeSelectedLayers(project.id, 0, step)}>
            <ChevronDown size={20} />
          </PadButton>
          <span />
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => shiftSelectionZOrder(project.id, 'forward')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] py-2.5 text-[13px] font-medium text-[var(--calqo-text-2)] active:bg-[var(--calqo-hover)]"
        >
          <ArrowUp size={16} />
          {t('mobile.arrange.forward')}
        </button>
        <button
          type="button"
          onClick={() => shiftSelectionZOrder(project.id, 'backward')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] py-2.5 text-[13px] font-medium text-[var(--calqo-text-2)] active:bg-[var(--calqo-hover)]"
        >
          <ArrowDown size={16} />
          {t('mobile.arrange.backward')}
        </button>
      </div>

      <div className="mt-5">
        <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
          {t('mobile.arrange.alignTitle')}
        </span>
        <div className="mt-2 grid grid-cols-6 gap-1.5">
          {ALIGN_ACTIONS.map(({ mode, icon: Icon, key }) => (
            <button
              key={mode}
              type="button"
              aria-label={t(`mobile.arrange.${key}`)}
              onClick={() => alignSelectionToArtboard(project.id, mode)}
              className="grid h-11 place-items-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[var(--calqo-text-2)] active:bg-[var(--calqo-hover)]"
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
