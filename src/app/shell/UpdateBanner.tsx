import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, RefreshCw } from 'lucide-react';
import {
  shouldShowUpdateBanner,
  useUpdaterStore,
} from '@/lib/state/updaterStore';

/** Desktop update gate. Sits where `PwaUpdatePrompt` sits for the browser
 * build, and shows only once a signed release newer than this build has
 * actually been resolved — background checks that find nothing, or that fail,
 * stay silent (Settings ▸ Updates reports those). */
export function UpdateBanner() {
  const { t } = useTranslation('common');
  const state = useUpdaterStore();
  const { phase, version, downloaded, total } = state;

  // Load the persisted skip/auto-check preferences so the banner honours them
  // even when the user never opens Settings.
  useEffect(() => {
    void useUpdaterStore.getState().load();
  }, []);

  if (!shouldShowUpdateBanner(state)) return null;

  const percent =
    total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;

  return (
    <div
      className="fixed inset-x-0 z-[100] flex justify-center px-3"
      style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <div className="glass glass-strong flex items-center gap-3 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] px-4 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
        {phase === 'downloading' ? (
          <RefreshCw
            size={15}
            className="shrink-0 animate-spin text-[var(--calqo-accent)]"
          />
        ) : (
          <ArrowDownToLine
            size={15}
            className="shrink-0 text-[var(--calqo-accent)]"
          />
        )}

        <span className="text-[13px] text-[var(--calqo-text)]">
          {phase === 'downloading'
            ? percent === null
              ? t('updates.downloading')
              : t('updates.downloadingPercent', { percent })
            : phase === 'ready'
              ? t('updates.ready', { version })
              : t('updates.available', { version })}
        </span>

        {phase === 'available' && (
          <>
            <button
              type="button"
              onClick={() => void useUpdaterStore.getState().install()}
              className="rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent)] px-3 py-1 text-[12.5px] font-semibold text-white transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] active:scale-95"
            >
              {t('updates.install')}
            </button>
            <button
              type="button"
              onClick={() => useUpdaterStore.getState().dismiss()}
              className="text-[12.5px] font-medium text-[var(--calqo-text-2)]"
            >
              {t('updates.later')}
            </button>
            <button
              type="button"
              onClick={() => useUpdaterStore.getState().skipCurrent()}
              className="text-[12.5px] font-medium text-[var(--calqo-text-3)]"
            >
              {t('updates.skip')}
            </button>
          </>
        )}

        {phase === 'ready' && (
          <button
            type="button"
            onClick={() => void useUpdaterStore.getState().restart()}
            className="rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent)] px-3 py-1 text-[12.5px] font-semibold text-white transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] active:scale-95"
          >
            {t('updates.restart')}
          </button>
        )}
      </div>
    </div>
  );
}
