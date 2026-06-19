import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassIconButton, GlassSegmentedControl } from '@/components/glass';
import i18n, { type AppLanguage } from '@/lib/i18n';
import {
  useUiStore,
  type ThemeMode,
  type TransparencyMode,
} from '@/lib/state/uiStore';
import {
  useAiSettingsStore,
  PROVIDER_LIST,
  PROVIDER_PRESETS,
} from '@/editor/ai/aiSettings';
import { useFocusTrap } from './useFocusTrap';

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
  const aiSettings = useAiSettingsStore((s) => s.settings);
  const setProvider = useAiSettingsStore((s) => s.setProvider);
  const setStoreKey = useAiSettingsStore((s) => s.setStoreKey);
  const updateProviderConfig = useAiSettingsStore((s) => s.updateProviderConfig);
  const dialogRef = useRef<HTMLElement>(null);
  const [languageMode, setLanguageModeState] = useState<LanguageMode>(
    getStoredLanguageMode,
  );
  useFocusTrap(dialogRef, open, onClose);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        tabIndex={-1}
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

        <div className="max-h-[70vh] space-y-4 overflow-y-auto calqo-scroll pr-1">
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

          <section>
            <div className="mb-2">
              <span className="eyebrow">{t('settings.ai.title')}</span>
            </div>
            <div className="glass-thin space-y-3 rounded-[var(--calqo-radius-md)] p-3">
              <SettingsRow label={t('settings.ai.provider')}>
                <select
                  aria-label={t('settings.ai.provider')}
                  value={aiSettings.providerId}
                  onChange={(event) =>
                    setProvider(event.target.value as typeof aiSettings.providerId)
                  }
                  className="h-8 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
                >
                  {PROVIDER_LIST.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </SettingsRow>

              {(() => {
                const preset = PROVIDER_PRESETS[aiSettings.providerId] ?? PROVIDER_PRESETS.mock;
                if (!preset.remote) {
                  return (
                    <p className="text-[11px] text-[var(--calqo-text-3)]">
                      {t('settings.ai.mockHint')}
                    </p>
                  );
                }
                const providerId = preset.id;
                const config = aiSettings.providers[providerId];
                return (
                  <div className="space-y-2 border-t border-[var(--calqo-divider)] pt-3">
                    {preset.editableBaseUrl && (
                      <TextSetting
                        label={t('settings.ai.baseUrl')}
                        value={config.baseUrl}
                        placeholder={preset.baseUrl || 'https://…/v1'}
                        onChange={(baseUrl) =>
                          updateProviderConfig(providerId, { baseUrl })
                        }
                      />
                    )}
                    <TextSetting
                      label={t('settings.ai.model')}
                      value={config.model}
                      placeholder={preset.defaultModel}
                      onChange={(model) =>
                        updateProviderConfig(providerId, { model })
                      }
                    />
                    {preset.needsKey && (
                      <>
                        <TextSetting
                          label={t('settings.ai.apiKey')}
                          value={config.apiKey}
                          type="password"
                          placeholder="sk-…"
                          onChange={(apiKey) =>
                            updateProviderConfig(providerId, { apiKey })
                          }
                        />
                        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-[var(--calqo-text-2)]">
                          <input
                            type="checkbox"
                            checked={aiSettings.storeKey}
                            onChange={(event) => setStoreKey(event.target.checked)}
                            className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
                          />
                          {t('settings.ai.storeKey')}
                        </label>
                        <p className="flex items-start gap-1.5 rounded-[var(--calqo-radius-sm)] bg-[#E8B339]/10 px-2.5 py-2 text-[11px] text-[#B7791F]">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          {t('settings.ai.keyWarning')}
                        </p>
                      </>
                    )}
                  </div>
                );
              })()}
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

function TextSetting({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password';
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[96px_1fr] items-center gap-2">
      <span className="text-[11.5px] font-medium text-[var(--calqo-text-2)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2.5 text-[12px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
      />
    </label>
  );
}
