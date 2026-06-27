import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MOBILE_HIDDEN_PROVIDERS,
  MOBILE_PROVIDER_LIST,
  PROVIDER_PRESETS,
  useAiSettingsStore,
} from '@/editor/ai/aiSettings';
import { BottomSheet } from '@/components/mobile';

interface MobileSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

function Field({
  label,
  value,
  type = 'text',
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  type?: 'text' | 'password';
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block py-2">
      <span className="mb-1 block text-[12px] font-medium text-[var(--calqo-text-2)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[14px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
      />
    </label>
  );
}

/** Phone settings — deliberately just the AI provider essentials rather than the
 * full desktop tabbed settings modal, which is too dense for a phone. */
export function MobileSettingsSheet({ open, onClose }: MobileSettingsSheetProps) {
  const { t } = useTranslation('common');
  const settings = useAiSettingsStore((s) => s.settings);
  const setProvider = useAiSettingsStore((s) => s.setProvider);
  const updateProviderConfig = useAiSettingsStore((s) => s.updateProviderConfig);

  // A phone may inherit a desktop "Local (Ollama)" selection that it can't
  // reach — fall back to turning AI off rather than calling an unreachable host.
  useEffect(() => {
    if (MOBILE_HIDDEN_PROVIDERS.includes(settings.providerId)) {
      setProvider('off');
    }
  }, [settings.providerId, setProvider]);

  const preset = PROVIDER_PRESETS[settings.providerId] ?? PROVIDER_PRESETS.off;
  const config = settings.providers[preset.id];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('settings.ai.title')}
      subtitle={t('settings.subtitle')}
      bodyClassName="pb-4"
    >
      <label className="block py-2">
        <span className="mb-1 block text-[12px] font-medium text-[var(--calqo-text-2)]">
          {t('settings.ai.provider')}
        </span>
        <select
          value={settings.providerId}
          onChange={(event) =>
            setProvider(event.target.value as typeof settings.providerId)
          }
          className="h-11 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[14px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
        >
          {MOBILE_PROVIDER_LIST.map((option) => (
            <option key={option.id} value={option.id}>
              {option.id === 'off' ? t('settings.ai.off') : option.label}
            </option>
          ))}
        </select>
      </label>

      {!preset.remote ? (
        <p className="mt-1 text-[12px] text-[var(--calqo-text-3)]">
          {t('settings.ai.offHint')}
        </p>
      ) : (
        <>
          {preset.editableBaseUrl && (
            <Field
              label={t('settings.ai.baseUrl')}
              value={config.baseUrl}
              placeholder={preset.baseUrl || 'https://…/v1'}
              onChange={(baseUrl) => updateProviderConfig(preset.id, { baseUrl })}
            />
          )}
          <Field
            label={t('settings.ai.model')}
            value={config.model}
            placeholder={preset.defaultModel}
            onChange={(model) => updateProviderConfig(preset.id, { model })}
          />
          {preset.needsKey && (
            <>
              <Field
                label={t('settings.ai.apiKey')}
                value={config.apiKey}
                type="password"
                placeholder="sk-…"
                onChange={(apiKey) => updateProviderConfig(preset.id, { apiKey })}
              />
              <p className="mt-1 text-[11.5px] text-[var(--calqo-text-3)]">
                {t('settings.ai.keyWarning')}
              </p>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}
