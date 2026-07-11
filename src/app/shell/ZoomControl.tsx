import { useTranslation } from 'react-i18next';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useUiStore } from '@/lib/state/uiStore';

/** Floating zoom pill over the canvas (GeoCarto §canvas chrome): − {pct} + ⤢. */
export function ZoomControl() {
  const { t } = useTranslation('editor');
  const zoom = useUiStore((s) => s.zoom);
  const setZoom = useUiStore((s) => s.setZoom);
  const requestFit = useUiStore((s) => s.requestFit);

  return (
    <div className="glass pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-0.5 rounded-[var(--calqo-radius-md)] p-1 text-[var(--calqo-text-2)] shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
      <button
        type="button"
        aria-label={t('status.zoomOut')}
        onClick={() => setZoom(zoom * 0.9)}
        className="touch-hitarea flex h-7 w-7 items-center justify-center rounded-[var(--calqo-radius-xs)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
      >
        <Minus size={15} />
      </button>
      <span className="mono w-12 text-center text-[12px] font-semibold text-[var(--calqo-text)]">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        aria-label={t('status.zoomIn')}
        onClick={() => setZoom(zoom * 1.1)}
        className="touch-hitarea flex h-7 w-7 items-center justify-center rounded-[var(--calqo-radius-xs)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
      >
        <Plus size={15} />
      </button>
      <span className="mx-0.5 h-4 w-px bg-[var(--calqo-divider)]" />
      <button
        type="button"
        aria-label={t('status.fitToScreen')}
        onClick={requestFit}
        className="touch-hitarea flex h-7 w-7 items-center justify-center rounded-[var(--calqo-radius-xs)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
