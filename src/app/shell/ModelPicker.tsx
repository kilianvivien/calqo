import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import type { AiModelInfo } from '@/editor/ai/AIProvider';
import { useAiSettingsStore, type AiProviderId } from '@/editor/ai/aiSettings';
import { getProvider } from '@/editor/ai/providerRegistry';
import { cn } from '@/lib/utils/cn';

type CatalogState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; models: AiModelInfo[] };

/** Model id field that can pull the provider's live model list, so new models
 * are selectable without a Calqo release. Free text always stays possible:
 * the list is a suggestion, not a constraint. */
export function ModelPicker({
  providerId,
  value,
  placeholder,
  onChange,
  size = 'desktop',
}: {
  providerId: AiProviderId;
  value: string;
  placeholder?: string;
  onChange: (model: string) => void;
  size?: 'desktop' | 'mobile';
}) {
  const { t } = useTranslation('common');
  const listId = useId();
  const settings = useAiSettingsStore((s) => s.settings);
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'idle' });
  const requestRef = useRef<AbortController | null>(null);

  // A different provider, endpoint or key means a different catalog.
  const config = settings.providers[providerId];
  const identity = `${providerId}|${config?.baseUrl ?? ''}|${config?.apiKey ?? ''}`;
  useEffect(() => {
    requestRef.current?.abort();
    setCatalog({ status: 'idle' });
  }, [identity]);
  useEffect(() => () => requestRef.current?.abort(), []);

  const provider = getProvider({ ...settings, providerId });
  const canList = Boolean(provider?.listModels);

  const refresh = async () => {
    if (!provider?.listModels) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setCatalog({ status: 'loading' });
    try {
      const models = await provider.listModels(controller.signal);
      if (controller.signal.aborted) return;
      setCatalog({ status: 'ready', models });
    } catch (error) {
      if (controller.signal.aborted) return;
      // Never log the request itself: it carries the API key.
      console.warn(
        '[Calqo] model list failed',
        error instanceof Error ? error.message : 'unknown error',
      );
      setCatalog({ status: 'error' });
    }
  };

  const models = catalog.status === 'ready' ? catalog.models : [];
  const describe = (model: AiModelInfo) =>
    [
      model.label && model.label !== model.id ? model.label : null,
      model.free ? t('settings.ai.modelFree') : null,
      model.vision ? t('settings.ai.modelVision') : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          list={listId}
          placeholder={placeholder}
          aria-label={t('settings.ai.model')}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'w-full min-w-0 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]',
            size === 'mobile' ? 'h-11 text-[14px]' : 'h-9 text-[13px]',
          )}
        />
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={!canList || catalog.status === 'loading'}
          aria-label={t('settings.ai.modelRefresh')}
          title={t('settings.ai.modelRefresh')}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] disabled:opacity-40',
            size === 'mobile' ? 'h-11 w-11' : 'h-9 w-9',
          )}
        >
          <RefreshCw
            size={14}
            className={
              catalog.status === 'loading' ? 'animate-spin' : undefined
            }
          />
        </button>
      </div>
      <datalist id={listId}>
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {describe(model)}
          </option>
        ))}
      </datalist>
      <p
        role="status"
        className="mt-1 text-[11.5px] leading-snug text-[var(--calqo-text-3)]"
      >
        {catalog.status === 'ready'
          ? t('settings.ai.modelListReady', { count: models.length })
          : catalog.status === 'error'
            ? t('settings.ai.modelListError')
            : canList
              ? t('settings.ai.modelListHint')
              : t('settings.ai.modelListUnavailable')}
      </p>
    </div>
  );
}
