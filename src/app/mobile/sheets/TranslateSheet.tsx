import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import {
  COMMON_CONTENT_LOCALES,
  localeLabel,
} from '@/editor/i18n-content/contentLocaleService';
import { runTranslation } from '@/editor/ai/translationService';
import { getProvider } from '@/editor/ai/providerRegistry';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import type { TranslationResult } from '@/editor/ai/AIProvider';
import { applyTranslationResult } from '@/editor/commands/projectCommands';
import type { CalqoProject, LocaleCode } from '@/lib/schema';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { BottomSheet } from '@/components/mobile';
import { GlassButton } from '@/components/glass';

interface TranslateSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
}

type Preview = {
  result: TranslationResult;
  rows: { layerId: string; source: string; target: string }[];
  unchanged: number;
  missing: number;
};

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
        onChange={(event) => onChange(event.target.value as LocaleCode)}
        className="h-11 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[14px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
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

/** Phone translation flow: pick source/target locales, run the configured
 * provider, review the result, and apply it across the active artboard. Mirrors
 * the desktop TranslateDialog but as a bottom sheet (PRD §5.9). */
export function TranslateSheet({ open, onClose, project }: TranslateSheetProps) {
  const { t } = useTranslation('editor');
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  const settings = useAiSettingsStore((s) => s.settings);

  const locales = useMemo(() => project.contentLocales, [project]);
  const [source, setSource] = useState<LocaleCode>(project.activeContentLocale);
  const [target, setTarget] = useState<LocaleCode>(
    locales.find((l) => l !== project.activeContentLocale) ?? 'en',
  );
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const targetOptions = useMemo(() => {
    const seen = new Set(locales);
    return [
      ...locales,
      ...COMMON_CONTENT_LOCALES.filter((l) => !seen.has(l.code)).map((l) => l.code),
    ];
  }, [locales]);

  const run = async () => {
    setBusy(true);
    setStatus(null);
    setPreview(null);
    try {
      const provider = getProvider(settings);
      if (!provider) {
        setBusy(false);
        return;
      }
      const { job, result, unchanged, missingLayerIds } = await runTranslation(
        provider,
        project,
        { sourceLocale: source, targetLocale: target, scope: 'active', activeArtboardId },
      );
      const sourceById = new Map(job.items.map((i) => [i.layerId, i.sourceText]));
      const rows = result.items.map((item) => ({
        layerId: item.layerId,
        source: sourceById.get(item.layerId) ?? '',
        target: item.translatedText,
      }));
      setPreview({ result, rows, unchanged, missing: missingLayerIds.length });
      if (rows.length === 0) setStatus(t('translate.noText'));
    } catch (error) {
      console.error('[Calqo] mobile translation failed', error);
      setStatus(t('translate.failed'));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!preview) return;
    applyTranslationResult(project.id, preview.result);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('translate.title')}
      subtitle={t('mobile.translate.subtitle')}
      bodyClassName="pb-4"
      footer={
        <>
          <GlassButton
            className="flex-1"
            onClick={run}
            disabled={busy || source === target}
          >
            {busy ? t('translate.running') : t('translate.run')}
          </GlassButton>
          <GlassButton
            variant="primary"
            className="flex-1"
            onClick={apply}
            disabled={!preview || preview.rows.length === 0}
          >
            {t('translate.apply')}
          </GlassButton>
        </>
      }
    >
      <div className="flex items-end gap-2">
        <LocaleSelect
          label={t('translate.from')}
          value={source}
          options={locales}
          onChange={setSource}
        />
        <ArrowRight size={16} className="mb-3 shrink-0 text-[var(--calqo-text-3)]" />
        <LocaleSelect
          label={t('translate.to')}
          value={target}
          options={targetOptions}
          onChange={setTarget}
        />
      </div>

      {status && (
        <p className="mt-3 text-[12px] text-[var(--calqo-text-3)]">{status}</p>
      )}

      {preview && preview.rows.length > 0 && (
        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">{t('translate.preview')}</span>
            {preview.missing > 0 && (
              <span className="text-[11px] text-[#B7791F]">
                {t('translate.missing', { count: preview.missing })}
              </span>
            )}
          </div>
          <div className="overflow-hidden rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)]">
            {preview.rows.map((row, i) => (
              <div
                key={row.layerId}
                className={i > 0 ? 'border-t border-[var(--calqo-divider)] p-2' : 'p-2'}
              >
                <p className="px-1 pb-1 text-[11.5px] text-[var(--calqo-text-3)]">
                  {row.source}
                </p>
                <p className="px-1 text-[13px] text-[var(--calqo-text)]">{row.target}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </BottomSheet>
  );
}
