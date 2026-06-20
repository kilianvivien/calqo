import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import {
  nudgeSelectedLayers,
  shiftSelectionZOrder,
} from '@/editor/commands/projectCommands';
import type { CalqoProject } from '@/lib/schema';
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

/** Fine-position and z-order controls for the current selection: a nudge pad
 * (1px / 10px step) plus bring-forward / send-backward (PRD §5.9 "nudge",
 * "reorder"). Coarse move/resize happen by touch on the canvas itself. */
export function ArrangeSheet({ open, onClose, project }: ArrangeSheetProps) {
  const { t } = useTranslation('editor');
  const [coarse, setCoarse] = useState(false);
  const step = coarse ? 10 : 1;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.arrange.title')}
      bodyClassName="pb-4"
    >
      <div className="flex items-center justify-between py-1">
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
    </BottomSheet>
  );
}
