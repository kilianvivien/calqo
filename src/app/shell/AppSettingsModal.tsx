import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassIconButton, GlassSegmentedControl } from '@/components/glass';
import i18n, { type AppLanguage } from '@/lib/i18n';
import {
  useUiStore,
  type ThemeMode,
  type TransparencyMode,
} from '@/lib/state/uiStore';

type LanguageMode = 'auto' | AppLanguage;

const LANGUAGE_KEY = 'calqo-language';

function getStoredLanguageMode(): LanguageMode {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return saved === 'en' || saved === 'fr' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function detectBrowserLanguage(): AppLanguage {
  const language = navigator.language.toLowerCase();
  return language.startsWith('fr') ? 'fr' : 'en';
}

function setLanguageMode(mode: LanguageMode): void {
  if (mode === 'auto') {
    try {
      localStorage.removeItem(LANGUAGE_KEY);
    } catch {
      /* ignore */
    }
    void i18n.changeLanguage(detectBrowserLanguage()).then(() => {
      try {
        localStorage.removeItem(LANGUAGE_KEY);
      } catch {
        /* ignore */
      }
    });
    return;
  }
  void i18n.changeLanguage(mode);
}

export function AppSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const transparency = useUiStore((s) => s.transparency);
  const setTransparency = useUiStore((s) => s.setTransparency);
  const [languageMode, setLanguageModeState] = useState<LanguageMode>(
    getStoredLanguageMode,
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const languageOptions = useMemo(
    () => [
      { value: 'auto' as const, label: t('settings.autoLanguage') },
      { value: 'en' as const, label: t('language.en') },
      { value: 'fr' as const, label: t('language.fr') },
    ],
    [t],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.45)] p-6 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        className="glass glass-strong w-[min(520px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="app-settings-title"
              className="text-[16px] font-semibold text-[var(--calqo-text)]"
            >
              {t('settings.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t('settings.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('actions.close')} onClick={onClose}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="space-y-4">
          <section>
            <div className="mb-2">
              <span className="eyebrow">{t('settings.general')}</span>
            </div>
            <div className="glass-thin rounded-[var(--calqo-radius-md)] p-3">
              <div className="grid grid-cols-[132px_1fr] items-center gap-3">
                <div>
                  <p className="text-[12px] font-medium text-[var(--calqo-text-2)]">
                    {t('settings.languageMode')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--calqo-text-3)]">
                    {t('settings.autoLanguageHint')}
                  </p>
                </div>
                <GlassSegmentedControl
                  ariaLabel={t('settings.languageMode')}
                  options={languageOptions}
                  value={languageMode}
                  onChange={(mode) => {
                    setLanguageModeState(mode);
                    setLanguageMode(mode);
                  }}
                  className="justify-self-end"
                />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2">
              <span className="eyebrow">{t('settings.appearance')}</span>
            </div>
            <div className="glass-thin space-y-3 rounded-[var(--calqo-radius-md)] p-3">
              <SettingsRow label={t('theme.toggle')}>
                <GlassSegmentedControl<ThemeMode>
                  ariaLabel={t('theme.toggle')}
                  options={[
                    { value: 'light', label: t('theme.light') },
                    { value: 'dark', label: t('theme.dark') },
                  ]}
                  value={theme}
                  onChange={setTheme}
                />
              </SettingsRow>
              <SettingsRow label={t('transparency.label')}>
                <GlassSegmentedControl<TransparencyMode>
                  ariaLabel={t('transparency.label')}
                  options={[
                    { value: 'auto', label: t('transparency.auto') },
                    { value: 'glass', label: t('transparency.glass') },
                    { value: 'solid', label: t('transparency.solid') },
                  ]}
                  value={transparency}
                  onChange={setTransparency}
                />
              </SettingsRow>
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
        {label}
      </span>
      {children}
    </div>
  );
}
