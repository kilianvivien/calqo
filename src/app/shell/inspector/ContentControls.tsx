import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Languages, Plus, X } from 'lucide-react';
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
                  className="ml-0.5 rounded-full p-0.5 text-[var(--calqo-text-3)] opacity-0 transition-opacity hover:text-[var(--calqo-text)] group-hover:opacity-100"
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
            </div>
            <textarea
              value={value ?? ''}
              placeholder={t('content.emptyVariant')}
              onChange={(event) =>
                updateTextForLocale(projectId, layer.id, locale, event.target.value)
              }
              className="min-h-12 w-full resize-y rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2.5 py-1.5 text-[12px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
            />
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
