import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Languages, Plus, Wand2, X } from 'lucide-react';
import {
  addContentLocale,
  removeContentLocale,
  setActiveContentLocale,
  updateTextForLocale,
} from '@/editor/commands/projectCommands';
import {
  COMMON_CONTENT_LOCALES,
  localeLabel,
} from '@/editor/i18n-content/contentLocaleService';
import { useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';
import { isAiEnabled, useAiSettingsStore } from '@/editor/ai/aiSettings';
import { COPY_ACTIONS, rewriteLayerCopy } from '@/editor/ai/copyService';
import type { CopyAction } from '@/editor/ai/prompts';
import { getProvider } from '@/editor/ai/providerRegistry';
import { aiReadiness } from '@/editor/ai/readiness';
import type { TextLayer } from '@/lib/schema';

/** Project-level content-locale management (plan §13, E1). Lives in the Style
 * tab. Content locales are independent of the app UI language. */
export function ContentLocalesSection() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const setAiDialog = useUiStore((s) => s.setAiDialog);
  const aiEnabled = useAiSettingsStore((s) => isAiEnabled(s.settings));

  if (!project) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">{t('content.locales')}</span>
        {aiEnabled && (
          <button
            type="button"
            onClick={() => setAiDialog('translate')}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--calqo-accent)] transition-colors hover:bg-[var(--calqo-accent-soft)]"
          >
            <Languages size={12} />
            {t('content.translate')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {project.contentLocales.map((locale) => {
          const active = locale === project.activeContentLocale;
          return (
            <span
              key={locale}
              className={[
                'group flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                active
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)] font-semibold text-[var(--calqo-accent)]'
                  : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)]',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => setActiveContentLocale(project.id, locale)}
                className="flex items-center gap-1"
              >
                <span className="mono uppercase">{locale}</span>
                <span className="text-[var(--calqo-text-3)]">{localeLabel(locale)}</span>
              </button>
              {project.contentLocales.length > 1 && (
                <button
                  type="button"
                  aria-label={t('content.removeLocale', { locale })}
                  onClick={() => removeContentLocale(project.id, locale)}
                  className="touch-hitarea ml-0.5 rounded-full p-0.5 text-[var(--calqo-text-3)] opacity-0 transition-opacity hover:text-[var(--calqo-text)] group-hover:opacity-100 any-pointer-coarse:opacity-100"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <AddLocaleRow
        projectId={project.id}
        existing={project.contentLocales}
        activeLocale={project.activeContentLocale}
      />
    </section>
  );
}

function AddLocaleRow({
  projectId,
  existing,
  activeLocale,
}: {
  projectId: string;
  existing: string[];
  activeLocale: string;
}) {
  const { t } = useTranslation('editor');
  const available = COMMON_CONTENT_LOCALES.filter((l) => !existing.includes(l.code));
  const [locale, setLocale] = useState(available[0]?.code ?? '');
  const [copyFrom, setCopyFrom] = useState(true);

  if (available.length === 0) return null;

  const add = () => {
    if (!locale) return;
    addContentLocale(projectId, locale, {
      copyFrom: copyFrom ? activeLocale : undefined,
    });
  };

  return (
    <div className="mt-3 glass-thin rounded-[var(--calqo-radius-sm)] p-2">
      <div className="flex items-center gap-2">
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
          aria-label={t('content.addLocale')}
          className="h-8 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
        >
          {available.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          className="flex h-8 items-center gap-1 rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent)] px-2.5 text-[12px] font-medium text-[var(--calqo-text-on-accent)] transition-opacity hover:opacity-90"
        >
          <Plus size={13} />
          {t('content.add')}
        </button>
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--calqo-text-3)]">
        <input
          type="checkbox"
          checked={copyFrom}
          onChange={(event) => setCopyFrom(event.target.checked)}
          className="h-3 w-3 accent-[var(--calqo-accent)]"
        />
        {t('content.copyFromActive', { locale: activeLocale.toUpperCase() })}
      </label>
    </div>
  );
}

/** Per-layer text variants — one editor per content locale. Rendered inside the
 * Properties tab when a single text layer is selected (E1). */
export function TextVariants({
  projectId,
  layer,
  locales,
  activeLocale,
}: {
  projectId: string;
  layer: TextLayer;
  locales: string[];
  activeLocale: string;
}) {
  const { t } = useTranslation('editor');
  const settings = useAiSettingsStore((s) => s.settings);
  const aiReady = isAiEnabled(settings) && aiReadiness(settings).ready;
  const [copyState, setCopyState] = useState<{
    locale: string;
    status: 'busy' | 'error' | 'overflow';
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // A pending rewrite belongs to the layer it was started on.
  useEffect(() => {
    setCopyState(null);
    return () => abortRef.current?.abort();
  }, [layer.id]);

  const rewrite = async (locale: string, action: CopyAction) => {
    const provider = getProvider(settings);
    if (!provider) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCopyState({ locale, status: 'busy' });
    try {
      const result = await rewriteLayerCopy(
        provider,
        layer,
        locale,
        action,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setCopyState({ locale, status: 'error' });
        return;
      }
      updateTextForLocale(projectId, layer.id, locale, result.text);
      setCopyState(result.overflows ? { locale, status: 'overflow' } : null);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(
        '[Calqo] copy rewrite failed',
        error instanceof Error ? error.message : error,
      );
      setCopyState({ locale, status: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {locales.map((locale) => {
        const value = layer.text[locale];
        const missing = value === undefined;
        const active = locale === activeLocale;
        return (
          <div key={locale}>
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className={[
                  'mono text-[10px] uppercase',
                  active ? 'text-[var(--calqo-accent)]' : 'text-[var(--calqo-text-3)]',
                ].join(' ')}
              >
                {locale}
              </span>
              {missing && (
                <span className="flex items-center gap-1 text-[10px] text-[#B7791F]">
                  <AlertTriangle size={10} />
                  {t('content.missingVariant')}
                </span>
              )}
              {aiReady && (value ?? '').trim() && (
                <label className="ml-auto flex items-center gap-1 text-[10.5px] text-[var(--calqo-accent)]">
                  <Wand2 size={11} />
                  <select
                    value=""
                    disabled={copyState?.status === 'busy'}
                    aria-label={t('content.copy.label', {
                      locale: locale.toUpperCase(),
                    })}
                    onChange={(event) => {
                      const action = event.target.value as CopyAction | '';
                      if (action) void rewrite(locale, action);
                    }}
                    className="max-w-[112px] cursor-pointer bg-transparent text-[10.5px] font-medium text-[var(--calqo-accent)] outline-none disabled:opacity-50"
                  >
                    <option value="">
                      {copyState?.locale === locale &&
                      copyState.status === 'busy'
                        ? t('content.copy.working')
                        : t('content.copy.menu')}
                    </option>
                    {COPY_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {t(`content.copy.actions.${action}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <textarea
              value={value ?? ''}
              placeholder={t('content.emptyVariant')}
              onChange={(event) =>
                updateTextForLocale(projectId, layer.id, locale, event.target.value)
              }
              className="min-h-12 w-full resize-y rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2.5 py-1.5 text-[12px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
            />
            {copyState?.locale === locale && copyState.status !== 'busy' && (
              <p role="status" className="mt-1 text-[10.5px] text-[#B7791F]">
                {t(`content.copy.${copyState.status}`)}
              </p>
            )}
          </div>
        );
      })}
      {layer.overflow?.hasOverflow && (
        <div className="flex items-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-2.5 py-1.5 text-[11px] text-[#B7791F]">
          <AlertTriangle size={12} />
          {t(`content.overflow.${layer.overflow.suggestedAction}`)}
        </div>
      )}
    </div>
  );
}
