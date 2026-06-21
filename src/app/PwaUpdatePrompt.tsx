import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

/** Service-worker update gate. When a new build is deployed, the waiting worker
 * is surfaced as a small prompt so installed PWAs don't stay pinned to a cached
 * version. Registration runs only in production builds — the `virtual:pwa-register`
 * module is provided by vite-plugin-pwa at build time, so it's imported lazily
 * and guarded to keep dev and the test runner clear of it. */
export function PwaUpdatePrompt() {
  const { t } = useTranslation('common');
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSW = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    let active = true;
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (!active) return;
        updateSW.current = registerSW({
          onNeedRefresh: () => setNeedRefresh(true),
        });
      })
      .catch(() => {
        /* No service worker support — nothing to prompt. */
      });
    return () => {
      active = false;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      className="fixed inset-x-0 z-[100] flex justify-center px-3"
      style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <div className="glass glass-strong flex items-center gap-3 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] px-4 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
        <RefreshCw size={15} className="shrink-0 text-[var(--calqo-accent)]" />
        <span className="text-[13px] text-[var(--calqo-text)]">
          {t('pwa.updateAvailable')}
        </span>
        <button
          type="button"
          onClick={() => void updateSW.current?.(true)}
          className="rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent)] px-3 py-1 text-[12.5px] font-semibold text-white transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] active:scale-95"
        >
          {t('pwa.reload')}
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="text-[12.5px] font-medium text-[var(--calqo-text-2)]"
        >
          {t('pwa.dismiss')}
        </button>
      </div>
    </div>
  );
}
