import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, RefreshCw, TriangleAlert } from 'lucide-react';
import { GlassButton } from '@/components/glass';
import { APP_VERSION } from '@/lib/appInfo';
import { useUpdaterStore } from '@/lib/state/updaterStore';

function formatChecked(at: number | null, locale: string): string | null {
  if (!at) return null;
  return new Date(at).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Settings ▸ Updates: the running version, a manual check, and the auto-check
 * preference. This is the only surface that reports "you are up to date" or a
 * failed check — the banner stays quiet unless there is something to install. */
export function UpdatesPane() {
  const { t, i18n } = useTranslation('common');
  const {
    phase,
    version,
    notes,
    error,
    lastCheckedAt,
    downloaded,
    total,
    settings,
  } = useUpdaterStore();

  useEffect(() => {
    void useUpdaterStore.getState().load();
  }, []);

  const supported = phase !== 'unsupported';
  const busy = phase === 'checking' || phase === 'downloading';
  const percent =
    total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const checkedAt = formatChecked(lastCheckedAt, i18n.language);

  return (
    <section className="space-y-5">
      <div>
        <h4 className="text-[13px] font-semibold text-[var(--calqo-text)]">
          {t('updates.title')}
        </h4>
        <p className="mt-1 text-[11.5px] text-[var(--calqo-text-3)]">
          {t('app.versionLabel', { version: APP_VERSION })}
        </p>
      </div>

      {!supported ? (
        <p className="text-[12.5px] text-[var(--calqo-text-2)]">
          {t('updates.browserHint')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <GlassButton
              onClick={() => void useUpdaterStore.getState().check()}
              disabled={busy}
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
              {t('updates.check')}
            </GlassButton>
            {phase === 'available' && (
              <GlassButton
                variant="primary"
                onClick={() => void useUpdaterStore.getState().install()}
              >
                <Download size={14} />
                {t('updates.installVersion', { version })}
              </GlassButton>
            )}
            {phase === 'ready' && (
              <GlassButton
                variant="primary"
                onClick={() => void useUpdaterStore.getState().restart()}
              >
                <RefreshCw size={14} />
                {t('updates.restart')}
              </GlassButton>
            )}
          </div>

          <div className="min-h-[20px] text-[12.5px]">
            {phase === 'checking' && (
              <span className="text-[var(--calqo-text-2)]">
                {t('updates.checking')}
              </span>
            )}
            {phase === 'downloading' && (
              <span className="text-[var(--calqo-text-2)]">
                {percent === null
                  ? t('updates.downloading')
                  : t('updates.downloadingPercent', { percent })}
              </span>
            )}
            {phase === 'available' && (
              <span className="text-[var(--calqo-text)]">
                {t('updates.available', { version })}
              </span>
            )}
            {phase === 'ready' && (
              <span className="flex items-center gap-1.5 text-[var(--calqo-text)]">
                <CheckCircle2
                  size={14}
                  className="text-[var(--calqo-accent)]"
                />
                {t('updates.ready', { version })}
              </span>
            )}
            {phase === 'idle' && lastCheckedAt !== null && (
              <span className="flex items-center gap-1.5 text-[var(--calqo-text-2)]">
                <CheckCircle2
                  size={14}
                  className="text-[var(--calqo-accent)]"
                />
                {t('updates.upToDate')}
              </span>
            )}
            {phase === 'error' && error && (
              <span className="flex items-start gap-1.5 text-[var(--calqo-text-2)]">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>
                  {error.reason === 'not-configured'
                    ? t('updates.errorNotConfigured')
                    : error.reason === 'network'
                      ? t('updates.errorNetwork')
                      : error.reason === 'signature'
                        ? t('updates.errorSignature')
                        : t('updates.errorInstall')}
                </span>
              </span>
            )}
          </div>

          {notes && (phase === 'available' || phase === 'ready') && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3">
              <h5 className="mb-1 text-[12px] font-semibold text-[var(--calqo-text)]">
                {t('updates.notes')}
              </h5>
              <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--calqo-text-2)]">
                {notes}
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 border-t border-[var(--calqo-divider)] pt-5">
            <input
              type="checkbox"
              checked={settings.autoCheck}
              onChange={(event) =>
                useUpdaterStore.getState().setAutoCheck(event.target.checked)
              }
              className="mt-0.5 accent-[var(--calqo-accent)]"
            />
            <span>
              <span className="block text-[13px] text-[var(--calqo-text)]">
                {t('updates.autoCheck')}
              </span>
              <span className="block text-[11.5px] text-[var(--calqo-text-3)]">
                {t('updates.autoCheckHint')}
              </span>
            </span>
          </label>

          {checkedAt && (
            <p className="text-[11.5px] text-[var(--calqo-text-3)]">
              {t('updates.lastChecked', { at: checkedAt })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
