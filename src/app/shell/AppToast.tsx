import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, X } from 'lucide-react';
import { GlassIconButton } from '@/components/glass';
import { useUiStore } from '@/lib/state/uiStore';

const AUTO_DISMISS_MS = 4_000;

/** Generic transient confirmation toast (e.g. "saved as model"). Complements
 * AssetHealthToast, which carries its own action button and warning styling. */
export function AppToast() {
  const { t } = useTranslation('editor');
  const message = useUiStore((s) => s.toast);
  const setToast = useUiStore((s) => s.setToast);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, setToast]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="glass glass-strong fixed bottom-12 left-1/2 z-50 flex w-[min(420px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] p-3 shadow-[0_12px_48px_rgba(0,0,0,0.28)]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
        <CheckCircle2 size={15} />
      </span>
      <p className="min-w-0 flex-1 text-[12px] text-[var(--calqo-text-2)]">
        {message}
      </p>
      <GlassIconButton label={t('export.close')} onClick={() => setToast(null)}>
        <X size={13} />
      </GlassIconButton>
    </div>
  );
}
