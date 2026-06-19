import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
} from '@/components/glass';
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
import { downloadCalqoAgentSkill } from '@/editor/ai/agentSkillFile';
import { useFocusTrap } from './useFocusTrap';

type LanguageMode = 'auto' | AppLanguage;
type SettingsTab = 'general' | 'appearance' | 'ai' | 'agent';

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
  const updateProviderConfig = useAiSettingsStore(
    (s) => s.updateProviderConfig,
  );
  const dialogRef = useRef<HTMLElement>(null);
  const [languageMode, setLanguageModeState] = useState<LanguageMode>(
    getStoredLanguageMode,
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  useFocusTrap(dialogRef, open, onClose);

  const languageOptions = useMemo(
    () => [
      { value: 'auto' as const, label: t('settings.autoLanguage') },
      { value: 'en' as const, label: t('language.en') },
      { value: 'fr' as const, label: t('language.fr') },
    ],
    [t],
  );
  const tabOptions = useMemo(
    () => [
      { id: 'general' as const, label: t('settings.general') },
      { id: 'appearance' as const, label: t('settings.appearance') },
      { id: 'ai' as const, label: t('settings.ai.title') },
      { id: 'agent' as const, label: t('settings.ai.agentSkill') },
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
        className="glass glass-strong flex max-h-[80vh] w-[min(620px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
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
          <GlassIconButton
            label={t('actions.close')}
            showTitle={false}
            onClick={onClose}
          >
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <nav aria-label={t('settings.title')} role="tablist" className="mb-4">
            <div className="flex gap-1 rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-glass-thin)] p-0.5">
              {tabOptions.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      'min-w-0 flex-1 rounded-[8px] px-2 py-1.5 text-[12px] font-medium outline-none transition-colors focus:ring-2 focus:ring-[var(--calqo-accent-ring)]',
                      selected
                        ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
                        : 'text-[var(--calqo-text-2)] hover:text-[var(--calqo-text)]',
                    ].join(' ')}
                  >
                    <span className="block truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="min-h-0 max-h-[58vh] overflow-y-auto calqo-scroll">
            {activeTab === 'general' && (
              <section className="space-y-5">
                <SettingsRow
                  label={t('settings.languageMode')}
                  hint={t('settings.autoLanguageHint')}
                >
                  <select
                    aria-label={t('settings.languageMode')}
                    value={languageMode}
                    onChange={(event) => {
                      const mode = event.target.value as LanguageMode;
                      setLanguageModeState(mode);
                      setLanguageMode(mode);
                    }}
                    className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[13px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
              </section>
            )}

            {activeTab === 'appearance' && (
              <section className="space-y-5">
                <SettingsRow label={t('theme.toggle')}>
                  <GlassSegmentedControl<ThemeMode>
                    ariaLabel={t('theme.toggle')}
                    options={[
                      { value: 'light', label: t('theme.light') },
                      { value: 'dark', label: t('theme.dark') },
                    ]}
                    value={theme}
                    onChange={setTheme}
                    className="justify-self-start"
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
                    className="justify-self-start"
                  />
                </SettingsRow>
              </section>
            )}

            {activeTab === 'ai' && (
              <section className="space-y-5">
                <SettingsRow label={t('settings.ai.provider')}>
                  <select
                    aria-label={t('settings.ai.provider')}
                    value={aiSettings.providerId}
                    onChange={(event) =>
                      setProvider(
                        event.target.value as typeof aiSettings.providerId,
                      )
                    }
                    className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[13px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
                  >
                    {PROVIDER_LIST.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </SettingsRow>

                {(() => {
                  const preset =
                    PROVIDER_PRESETS[aiSettings.providerId] ??
                    PROVIDER_PRESETS.mock;
                  if (!preset.remote) {
                    return (
                      <SettingsNote>{t('settings.ai.mockHint')}</SettingsNote>
                    );
                  }
                  const providerId = preset.id;
                  const config = aiSettings.providers[providerId];
                  return (
                    <>
                      <SettingsNote>
                        {preset.adapterKind === 'official'
                          ? t('settings.ai.officialHint')
                          : t('settings.ai.compatibleHint')}
                      </SettingsNote>
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
                          <SettingsRow label={t('settings.ai.storeKeyShort')}>
                            <input
                              type="checkbox"
                              checked={aiSettings.storeKey}
                              aria-label={t('settings.ai.storeKey')}
                              onChange={(event) =>
                                setStoreKey(event.target.checked)
                              }
                              className="mt-2 h-4 w-4 accent-[var(--calqo-accent)]"
                            />
                          </SettingsRow>
                          <SettingsNote>
                            <span className="flex items-start gap-2 rounded-[var(--calqo-radius-sm)] bg-[#E8B339]/10 px-3 py-2.5 text-[12px] text-[#B7791F]">
                              <AlertTriangle
                                size={15}
                                className="mt-0.5 shrink-0"
                              />
                              {t('settings.ai.keyWarning')}
                            </span>
                          </SettingsNote>
                        </>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

            {activeTab === 'agent' && (
              <section className="space-y-5">
                <SettingsRow
                  label={t('settings.ai.agentSkill')}
                  hint={t('settings.ai.agentSkillHint')}
                >
                  <GlassButton onClick={() => void downloadCalqoAgentSkill()}>
                    {t('settings.ai.downloadSkill')}
                  </GlassButton>
                </SettingsRow>
              </section>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3">
      <div>
        <p className="text-[13px] font-medium leading-10 text-[var(--calqo-text)]">
          {label}
        </p>
        {hint && (
          <p className="text-[11.5px] leading-snug text-[var(--calqo-text-3)]">
            {hint}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SettingsNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3">
      <span aria-hidden="true" />
      <div className="min-w-0 text-[12px] leading-snug text-[var(--calqo-text-3)]">
        {children}
      </div>
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
    <label className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[13px] font-medium text-[var(--calqo-text)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[13px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
      />
    </label>
  );
}
