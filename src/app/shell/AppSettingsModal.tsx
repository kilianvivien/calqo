import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  FileCode2,
  Palette,
  Settings2,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
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
      { id: 'general' as const, label: t('settings.general'), icon: Settings2 },
      { id: 'appearance' as const, label: t('settings.appearance'), icon: Palette },
      { id: 'ai' as const, label: t('settings.ai.title'), icon: Sparkles },
      { id: 'agent' as const, label: t('settings.ai.agentSkill'), icon: FileCode2 },
    ],
    [t],
  ) satisfies { id: SettingsTab; label: string; icon: LucideIcon }[];
  const activeTabLabel = tabOptions.find((tab) => tab.id === activeTab)?.label ?? '';

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
        className="glass glass-strong flex max-h-[80vh] w-[min(760px,100%)] overflow-hidden rounded-[28px] border border-[var(--calqo-divider)] shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <nav
          aria-label={t('settings.title')}
          role="tablist"
          className="flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3"
        >
          <div className="mb-2 px-2 pt-1">
            <h2
              id="app-settings-title"
              className="text-[15px] font-semibold text-[var(--calqo-text)]"
            >
              {t('settings.title')}
            </h2>
            <p className="mt-0.5 text-[11.5px] leading-snug text-[var(--calqo-text-3)]">
              {t('settings.subtitle')}
            </p>
          </div>
          {tabOptions.map((tab) => {
            const selected = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex items-center gap-2.5 rounded-[var(--calqo-radius-sm)] px-2.5 py-2 text-left text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--calqo-accent-ring)]',
                  selected
                    ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)] outline outline-[0.5px] outline-[var(--calqo-accent-ring)]'
                    : 'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
                ].join(' ')}
              >
                <Icon size={15} className="shrink-0" />
                <span className="min-w-0 truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-[var(--calqo-divider)] px-5 py-3.5">
            <h3 className="text-[14px] font-semibold text-[var(--calqo-text)]">
              {activeTabLabel}
            </h3>
            <GlassIconButton
              label={t('actions.close')}
              showTitle={false}
              onClick={onClose}
            >
              <X size={15} />
            </GlassIconButton>
          </header>

          <div
            role="tabpanel"
            className="min-h-0 flex-1 overflow-y-auto calqo-scroll px-5 py-5"
          >
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
