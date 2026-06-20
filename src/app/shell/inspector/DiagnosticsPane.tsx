import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Download, ShieldCheck } from 'lucide-react';
import { GlassButton } from '@/components/glass';
import { files } from '@/lib/adapters';
import { useActiveProject } from '@/lib/state/selectors';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import { buildProjectDiagnostics } from '@/editor/diagnostics/projectDiagnostics';

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'calqo'
  );
}

export function DiagnosticsPane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const settings = useAiSettingsStore((s) => s.settings);
  const [status, setStatus] = useState<string | null>(null);
  const diagnostics = useMemo(
    () => (project ? buildProjectDiagnostics(project, settings, t) : null),
    [project, settings, t],
  );

  if (!project || !diagnostics) {
    return (
      <div className="space-y-2">
        <span className="eyebrow">{t('diagnostics.title')}</span>
        <p className="text-[12px] text-[var(--calqo-text-3)]">
          {t('diagnostics.empty')}
        </p>
      </div>
    );
  }

  const download = async () => {
    setStatus(null);
    try {
      await files.downloadBlob(
        new Blob([JSON.stringify(diagnostics, null, 2)], {
          type: 'application/json',
        }),
        `${slug(project.name)}-diagnostics.json`,
      );
      setStatus(t('diagnostics.exported'));
    } catch (error) {
      console.error('[Calqo] diagnostics export failed', error);
      setStatus(t('export.failed'));
    }
  };

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Activity size={13} className="text-[var(--calqo-text-3)]" />
            <span className="eyebrow">{t('diagnostics.title')}</span>
          </span>
          <GlassButton onClick={download}>
            <Download size={13} />
            {t('diagnostics.exportJson')}
          </GlassButton>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <Metric label={t('diagnostics.schema')} value={`v${diagnostics.project.schemaVersion}`} />
          <Metric label={t('diagnostics.artboards')} value={diagnostics.project.artboards} />
          <Metric label={t('diagnostics.assets')} value={diagnostics.project.assets} />
          <Metric label={t('diagnostics.locales')} value={diagnostics.project.contentLocales.join(', ')} />
          <Metric label={t('diagnostics.warnings')} value={diagnostics.warnings.total} />
          <Metric label={t('diagnostics.glossary')} value={diagnostics.project.glossaryTerms} />
        </dl>
        {status && (
          <p className="mt-2 text-[11px] text-[var(--calqo-text-3)]">{status}</p>
        )}
      </section>

      <section>
        <span className="eyebrow">{t('diagnostics.provider')}</span>
        <div className="mt-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--calqo-text)]">
            <ShieldCheck size={14} className="text-[var(--calqo-accent)]" />
            {diagnostics.provider.label}
          </p>
          <p className="mt-1 text-[11px] text-[var(--calqo-text-3)]">
            {t('diagnostics.providerDetails', {
              mode: t(`diagnostics.mode.${diagnostics.provider.mode}`),
              key: diagnostics.provider.keyConfigured
                ? t('diagnostics.keyConfigured')
                : t('diagnostics.keyMissing'),
            })}
          </p>
        </div>
      </section>

      <section>
        <span className="eyebrow">{t('diagnostics.artboardDetails')}</span>
        <div className="mt-2 space-y-2">
          {diagnostics.artboards.map((artboard) => (
            <div
              key={artboard.id}
              className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-[var(--calqo-text)]">
                    {artboard.name}
                  </p>
                  <p className="mono mt-0.5 text-[10.5px] text-[var(--calqo-text-3)]">
                    {artboard.width} x {artboard.height} · {artboard.preset}
                  </p>
                </div>
                <span className="mono rounded-full bg-[var(--calqo-accent-soft)] px-2 py-0.5 text-[10.5px] text-[var(--calqo-accent)]">
                  {artboard.layers.total} {t('diagnostics.layers')}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--calqo-text-3)]">
                {t('diagnostics.layerMix', {
                  text: artboard.layers.byType.text + artboard.layers.byType.list,
                  shape: artboard.layers.byType.shape,
                  media: artboard.layers.byType.image + artboard.layers.byType.svg,
                })}
              </p>
              {artboard.warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {artboard.warnings.map((warning) => (
                    <li key={warning} className="text-[11px] text-[#B7791F]">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-2">
      <dt className="text-[10.5px] text-[var(--calqo-text-3)]">{label}</dt>
      <dd className="mt-1 truncate text-[12px] font-semibold text-[var(--calqo-text)]">
        {value}
      </dd>
    </div>
  );
}
