import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Languages, Plus, Trash2, X } from 'lucide-react';
import { GlassButton, GlassIconButton, GlassSegmentedControl } from '@/components/glass';
import {
  COMMON_CONTENT_LOCALES,
  localeLabel,
} from '@/editor/i18n-content/contentLocaleService';
import type { TranslationScope } from '@/editor/i18n-content/translationPipeline';
import { runTranslation } from '@/editor/ai/translationService';
import { getProvider } from '@/editor/ai/providerRegistry';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import type { TranslationResult } from '@/editor/ai/AIProvider';
import {
  applyTranslationResult,
  updateGlossary,
} from '@/editor/commands/projectCommands';
import { useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import type { GlossaryEntry, LocaleCode } from '@/lib/schema';

type Preview = {
  result: TranslationResult;
  rows: { layerId: string; source: string; target: string }[];
  unchanged: number;
};

export function TranslateDialog() {
  const aiDialog = useUiStore((s) => s.aiDialog);
  if (aiDialog !== 'translate') return null;
  return <TranslateDialogInner />;
}

function TranslateDialogInner() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  const setAiDialog = useUiStore((s) => s.setAiDialog);
  const settings = useAiSettingsStore((s) => s.settings);
  const close = () => setAiDialog('none');

  const locales = useMemo(() => project?.contentLocales ?? [], [project]);
  const [source, setSource] = useState<LocaleCode>(
    project?.activeContentLocale ?? locales[0] ?? 'en',
  );
  const [target, setTarget] = useState<LocaleCode>(
    locales.find((l) => l !== source) ?? 'fr',
  );
  const [scope, setScope] = useState<TranslationScope>('active');
  const [glossary, setGlossaryState] = useState<GlossaryEntry[]>(
    project?.glossary ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Targets: existing locales plus any common locale not yet in the project.
  const targetOptions = useMemo(() => {
    const seen = new Set(locales);
    const extra = COMMON_CONTENT_LOCALES.filter((l) => !seen.has(l.code)).map(
      (l) => l.code,
    );
    return [...locales, ...extra];
  }, [locales]);

  if (!project) return null;

  const runJob = async () => {
    setBusy(true);
    setStatus(null);
    setPreview(null);
    try {
      const provider = getProvider(settings);
      const { job, result, unchanged } = await runTranslation(
        provider,
        { ...project, glossary },
        { sourceLocale: source, targetLocale: target, scope, activeArtboardId },
      );
      const sourceById = new Map(job.items.map((i) => [i.layerId, i.sourceText]));
      const rows = result.items.map((item) => ({
        layerId: item.layerId,
        source: sourceById.get(item.layerId) ?? '',
        target: item.translatedText,
      }));
      setPreview({ result, rows, unchanged });
      if (rows.length === 0) setStatus(t('translate.noText'));
    } catch (error) {
      console.error('[Calqo] translation failed', error);
      setStatus(t('translate.failed'));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!preview) return;
    updateGlossary(project.id, glossary);
    applyTranslationResult(project.id, preview.result);
    setStatus(t('translate.applied'));
    close();
  };

  const updateRow = (layerId: string, value: string) => {
    if (!preview) return;
    const rows = preview.rows.map((r) =>
      r.layerId === layerId ? { ...r, target: value } : r,
    );
    const result: TranslationResult = {
      ...preview.result,
      items: preview.result.items.map((item) =>
        item.layerId === layerId ? { ...item, translatedText: value } : item,
      ),
    };
    setPreview({ ...preview, rows, result });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.45)] p-6 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="translate-title"
        className="glass glass-strong flex max-h-[88vh] w-[min(680px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="translate-title"
              className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
            >
              <Languages size={17} className="text-[var(--calqo-accent)]" />
              {t('translate.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t('translate.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('export.close')} onClick={close}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto calqo-scroll pr-1">
          <div className="flex items-center gap-2">
            <LocaleSelect
              label={t('translate.from')}
              value={source}
              options={locales}
              onChange={(v) => setSource(v)}
            />
            <ArrowRight size={15} className="mt-5 shrink-0 text-[var(--calqo-text-3)]" />
            <LocaleSelect
              label={t('translate.to')}
              value={target}
              options={targetOptions}
              onChange={(v) => setTarget(v)}
            />
          </div>

          <Field label={t('translate.scope')}>
            <GlassSegmentedControl<TranslationScope>
              ariaLabel={t('translate.scope')}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'active', label: t('export.activeArtboard') },
                {
                  value: 'all',
                  label: t('export.allArtboards', { count: project.artboards.length }),
                },
              ]}
            />
          </Field>

          <GlossaryEditor glossary={glossary} onChange={setGlossaryState} />

          {preview && preview.rows.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow">{t('translate.preview')}</span>
                {preview.unchanged > 0 && (
                  <span className="text-[11px] text-[#B7791F]">
                    {t('translate.unchanged', { count: preview.unchanged })}
                  </span>
                )}
              </div>
              <div className="overflow-hidden rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)]">
                {preview.rows.map((row, i) => (
                  <div
                    key={row.layerId}
                    className={[
                      'grid grid-cols-2 gap-2 p-2',
                      i > 0 ? 'border-t border-[var(--calqo-divider)]' : '',
                    ].join(' ')}
                  >
                    <p className="px-1 py-1 text-[12px] text-[var(--calqo-text-3)]">
                      {row.source}
                    </p>
                    <textarea
                      value={row.target}
                      onChange={(event) => updateRow(row.layerId, event.target.value)}
                      className="min-h-9 w-full resize-y rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--calqo-divider)] pt-4">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--calqo-text-3)]">
            {status && <Check size={13} className="text-[var(--calqo-accent)]" />}
            {status}
          </span>
          <div className="flex items-center gap-2">
            <GlassButton onClick={runJob} disabled={busy || source === target}>
              {busy ? t('translate.running') : t('translate.run')}
            </GlassButton>
            <GlassButton variant="primary" onClick={apply} disabled={!preview || preview.rows.length === 0}>
              {t('translate.apply')}
            </GlassButton>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function LocaleSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: LocaleCode) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-[12px] font-medium text-[var(--calqo-text-2)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
      >
        {options.map((code) => (
          <option key={code} value={code}>
            {localeLabel(code)} ({code})
          </option>
        ))}
      </select>
    </label>
  );
}

function GlossaryEditor({
  glossary,
  onChange,
}: {
  glossary: GlossaryEntry[];
  onChange: (glossary: GlossaryEntry[]) => void;
}) {
  const { t } = useTranslation('editor');
  const add = () =>
    onChange([...glossary, { source: '', mode: 'do-not-translate' }]);
  const update = (index: number, patch: Partial<GlossaryEntry>) =>
    onChange(glossary.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  const remove = (index: number) =>
    onChange(glossary.filter((_, i) => i !== index));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">{t('translate.glossary')}</span>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--calqo-accent)] transition-colors hover:bg-[var(--calqo-accent-soft)]"
        >
          <Plus size={12} />
          {t('translate.glossaryAdd')}
        </button>
      </div>
      {glossary.length === 0 ? (
        <p className="px-1 text-[11px] text-[var(--calqo-text-3)]">
          {t('translate.glossaryHint')}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {glossary.map((entry, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                value={entry.source}
                placeholder={t('translate.glossarySource')}
                onChange={(event) => update(index, { source: event.target.value })}
                className="h-8 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
              />
              <select
                value={entry.mode}
                onChange={(event) =>
                  update(index, {
                    mode: event.target.value as GlossaryEntry['mode'],
                  })
                }
                className="h-8 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-1.5 text-[11px] text-[var(--calqo-text-2)] outline-none focus:border-[var(--calqo-accent)]"
              >
                <option value="do-not-translate">{t('translate.glossaryKeep')}</option>
                <option value="preferred-translation">
                  {t('translate.glossaryPreferred')}
                </option>
              </select>
              {entry.mode === 'preferred-translation' && (
                <input
                  value={entry.target ?? ''}
                  placeholder={t('translate.glossaryTarget')}
                  onChange={(event) => update(index, { target: event.target.value })}
                  className="h-8 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
                />
              )}
              <button
                type="button"
                aria-label={t('translate.glossaryRemove')}
                onClick={() => remove(index)}
                className="shrink-0 rounded-[var(--calqo-radius-sm)] p-1.5 text-[var(--calqo-text-3)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
