import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  DatabaseBackup,
  Download,
  FileCode2,
  Palette,
  Settings2,
  Sparkles,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
  ModalOverlay,
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
import {
  downloadCalqoAgentSkill,
  downloadClaudeAgentSkill,
} from '@/editor/ai/agentSkillFile';
import {
  downloadAppBackup,
  parseBackup,
  restoreAppBackup,
} from '@/editor/backup/appBackup';
import { flushPendingSaves } from '@/editor/commands/projectCommands';
import { dialog } from '@/lib/adapters';
import { platformRuntime } from '@/lib/platform/runtime';
import { DiagnosticsPane } from './inspector/DiagnosticsPane';

type LanguageMode = 'auto' | AppLanguage;
export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'ai'
  | 'agent'
  | 'data'
  | 'diagnostics';

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
  initialTab = 'general',
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
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
  const [languageMode, setLanguageModeState] = useState<LanguageMode>(
    getStoredLanguageMode,
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const secureSettings = platformRuntime.capabilities.secureSettings;
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const handleExportBackup = async () => {
    setBackupBusy(true);
    setBackupStatus(null);
    try {
      const count = await downloadAppBackup();
      setBackupStatus(t('settings.data.exported', { count }));
    } catch (error) {
      console.error('[Calqo] backup export failed', error);
      setBackupStatus(t('settings.data.failed'));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreFile = async (file: File) => {
    setBackupBusy(true);
    setBackupStatus(null);
    try {
      const backup = parseBackup(await file.text());
      const confirmed = await dialog.confirm({
        title: t('settings.data.restoreTitle'),
        message: t('settings.data.restoreConfirm', {
          count: backup.projects.length,
        }),
      });
      if (!confirmed) {
        setBackupBusy(false);
        return;
      }
      await flushPendingSaves();
      await restoreAppBackup(backup);
      // Settings and UI preferences are read at startup, so reload to apply the
      // restored theme, language, and provider config cleanly.
      window.location.reload();
    } catch (error) {
      console.error('[Calqo] backup restore failed', error);
      setBackupStatus(
        error instanceof Error && error.message
          ? error.message
          : t('settings.data.failed'),
      );
      setBackupBusy(false);
    }
  };

  // Deep-link to a tab each time the modal opens (e.g. Help ▸ Diagnostics).
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

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
      { id: 'data' as const, label: t('settings.data.title'), icon: DatabaseBackup },
      { id: 'diagnostics' as const, label: t('settings.diagnostics'), icon: Activity },
    ],
    [t],
  ) satisfies { id: SettingsTab; label: string; icon: LucideIcon }[];
  const activeTabLabel = tabOptions.find((tab) => tab.id === activeTab)?.label ?? '';

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      labelledBy="app-settings-title"
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
                        {preset.id === 'off'
                          ? t('settings.ai.off')
                          : preset.label}
                      </option>
                    ))}
                  </select>
                </SettingsRow>

                {(() => {
                  const preset =
                    PROVIDER_PRESETS[aiSettings.providerId] ??
                    PROVIDER_PRESETS.off;
                  if (!preset.remote) {
                    return (
                      <SettingsNote>{t('settings.ai.offHint')}</SettingsNote>
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
                          {!secureSettings && (
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
                          )}
                          <SettingsNote>
                            {secureSettings ? (
                              <span className="flex items-start gap-2 rounded-[var(--calqo-radius-sm)] bg-[#E8B339]/10 px-3 py-2.5 text-[12px] text-[#B7791F]">
                                {config.apiKey.trim().length > 0
                                  ? t('settings.ai.keySavedNote')
                                  : t('settings.ai.desktopKeyWarning')}
                              </span>
                            ) : (
                              <span className="flex items-start gap-2 rounded-[var(--calqo-radius-sm)] bg-[#E8B339]/10 px-3 py-2.5 text-[12px] text-[#B7791F]">
                                {(!aiSettings.storeKey || config.apiKey.trim().length === 0) && (
                                  <AlertTriangle
                                    size={15}
                                    className="mt-0.5 shrink-0"
                                  />
                                )}
                                {aiSettings.storeKey && config.apiKey.trim().length > 0
                                  ? t('settings.ai.keySavedNote')
                                  : t('settings.ai.keyWarning')}
                              </span>
                            )}
                          </SettingsNote>
                        </>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

            {activeTab === 'agent' && (
              <section className="flex flex-col items-start gap-4 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
                  <FileCode2 size={22} />
                </span>
                <div className="space-y-1.5">
                  <p className="text-[14px] font-semibold text-[var(--calqo-text)]">
                    {t('settings.ai.agentSkill')}
                  </p>
                  <p className="max-w-md text-[12.5px] leading-relaxed text-[var(--calqo-text-3)]">
                    {t('settings.ai.agentSkillHint')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GlassButton
                    variant="primary"
                    onClick={() => void downloadCalqoAgentSkill()}
                  >
                    <Download size={14} />
                    {t('settings.ai.downloadSkill')}
                  </GlassButton>
                  <GlassButton onClick={() => void downloadClaudeAgentSkill()}>
                    <Download size={14} />
                    {t('settings.ai.downloadClaudeSkill')}
                  </GlassButton>
                </div>
              </section>
            )}

            {activeTab === 'data' && (
              <section className="flex flex-col items-start gap-4 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
                  <DatabaseBackup size={22} />
                </span>
                <div className="space-y-1.5">
                  <p className="text-[14px] font-semibold text-[var(--calqo-text)]">
                    {t('settings.data.title')}
                  </p>
                  <p className="max-w-md text-[12.5px] leading-relaxed text-[var(--calqo-text-3)]">
                    {t('settings.data.hint')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GlassButton
                    variant="primary"
                    onClick={() => void handleExportBackup()}
                    disabled={backupBusy}
                    loading={backupBusy}
                  >
                    {!backupBusy && <Download size={14} />}
                    {t('settings.data.export')}
                  </GlassButton>
                  <GlassButton
                    onClick={() => restoreInputRef.current?.click()}
                    disabled={backupBusy}
                  >
                    <Upload size={14} />
                    {t('settings.data.restore')}
                  </GlassButton>
                  <input
                    ref={restoreInputRef}
                    type="file"
                    accept=".calqobackup,application/json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void handleRestoreFile(file);
                    }}
                  />
                </div>
                <p className="flex items-start gap-2 rounded-[var(--calqo-radius-sm)] bg-[#E8B339]/10 px-3 py-2.5 text-[12px] text-[#B7791F]">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {t('settings.data.secretsNote')}
                </p>
                {backupStatus && (
                  <p className="text-[12px] text-[var(--calqo-text-2)]">{backupStatus}</p>
                )}
              </section>
            )}

            {activeTab === 'diagnostics' && <DiagnosticsPane />}
          </div>
        </div>
    </ModalOverlay>
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
