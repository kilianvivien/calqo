import { useTranslation } from 'react-i18next';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import { aiReadiness } from '@/editor/ai/readiness';

export function AiReadinessNote() {
  const { t } = useTranslation('editor');
  const settings = useAiSettingsStore((s) => s.settings);
  const persistenceError = useAiSettingsStore((s) => s.persistenceError);
  const state = aiReadiness(settings);
  return (
    <div
      className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2 text-[12px] text-[var(--calqo-text-2)]"
      role="status"
    >
      <p>
        {state.destination === 'demo'
          ? t('ai.readiness.demo')
          : `${state.provider}${state.model ? ` · ${state.model}` : ''}`}
      </p>
      {!state.issues.includes('off') && (
        <p>{t(`ai.readiness.${state.destination}Hint`)}</p>
      )}
      {state.issues.map((issue) => (
        <p key={issue}>{t(`ai.readiness.${issue}`)}</p>
      ))}
      {persistenceError && <p>{t('ai.readiness.storageError')}</p>}
    </div>
  );
}
