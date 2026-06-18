import { useTranslation } from 'react-i18next';

/** Bottom status bar — mono meta in the calm GeoCarto register. */
export function StatusBar() {
  const { t } = useTranslation('editor');

  return (
    <footer className="flex h-7 items-center justify-between border-t border-[var(--calqo-divider)] px-4 mono text-[10.5px] text-[var(--calqo-text-3)]">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#28c840] shadow-[0_0_6px_#28c840]" />
          {t('status.saved')}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span>
          {t('status.selection')}: —
        </span>
        <span>{t('status.zoom')}: 100%</span>
      </div>
    </footer>
  );
}
