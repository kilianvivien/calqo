import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Download, X } from 'lucide-react';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
  ModalOverlay,
} from '@/components/glass';
import { assetStorage, clipboard, files } from '@/lib/adapters';
import {
  exportArtboardRaster,
  rasterFilename,
  type RasterFormat,
} from '@/editor/export/rasterExport';
import { exportArtboardSvg } from '@/editor/export/svgExport';
import { htmlSnippet, htmlStandalone } from '@/editor/export/htmlExport';
import { exportArtboardHtmlLayout } from '@/editor/export/htmlLayoutExport';
import { blobToBytes, createZip } from '@/editor/export/zip';
import {
  collectExportWarnings,
  uniqueArtboardStems,
} from '@/editor/export/exportReadiness';
import { estimateEnvelopeBytes } from '@/editor/assets/assetHealth';
import { useMissingAssetsStore } from '@/editor/assets/missingAssetsStore';
import { localeLabel } from '@/editor/i18n-content/contentLocaleService';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';
import type { CalqoArtboard, LocaleCode } from '@/lib/schema';

type Format = RasterFormat | 'svg' | 'html';
type Scope = 'active' | 'all';
type HtmlKind = 'wrapper' | 'editable';
type HtmlMode = 'standalone' | 'snippet';
type Scale = '1' | '2' | '3';

function isRaster(format: Format): format is RasterFormat {
  return format === 'png' || format === 'jpeg' || format === 'webp';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

export function ExportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const [format, setFormat] = useState<Format>('png');
  const [scale, setScale] = useState<Scale>('2');
  const pixelRatio = Number(scale) as 1 | 2 | 3;
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(0.92);
  const [scope, setScope] = useState<Scope>('active');
  const [localeScope, setLocaleScope] = useState<Scope>('active');
  const [htmlKind, setHtmlKind] = useState<HtmlKind>('wrapper');
  const [htmlMode, setHtmlMode] = useState<HtmlMode>('standalone');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Live render counter so a long multi-artboard/multi-locale export shows
  // progress rather than an indefinite spinner.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Fidelity notes returned by the last editable-HTML export.
  const [fidelityNotes, setFidelityNotes] = useState<string[]>([]);
  // Estimated `.calqo` envelope size (project JSON + base64 assets), plus the
  // asset names contributing most to it so the warning is actionable.
  const [envelopeEstimate, setEnvelopeEstimate] = useState<number | null>(null);
  const [envelopeContributors, setEnvelopeContributors] = useState<string[]>([]);
  const thresholds = useUiStore((s) => s.assetHealthThresholds);
  const setOptimizeAssetsOpen = useUiStore((s) => s.setOptimizeAssetsOpen);
  const setRepairAssetsOpen = useUiStore((s) => s.setRepairAssetsOpen);
  const missingAssetCount = useMissingAssetsStore((s) =>
    project ? (s.byProject[project.id]?.length ?? 0) : 0,
  );

  const targets = useMemo<CalqoArtboard[]>(() => {
    if (!project || !artboard) return [];
    return scope === 'all' ? project.artboards : [artboard];
  }, [project, artboard, scope]);

  const localeTargets = useMemo<LocaleCode[]>(() => {
    if (!project) return [];
    return localeScope === 'all' ? project.contentLocales : [project.activeContentLocale];
  }, [project, localeScope]);

  const warnings = useMemo(
    () =>
      collectExportWarnings({ project, targets, exportingAll: scope === 'all' }, t),
    [project, targets, scope, t],
  );

  // Estimate the portable `.calqo` payload while the dialog is open so heavy
  // projects are flagged before they ship (asset-health soft limit).
  const projectId = project?.id ?? null;
  const assetSignature = project?.assets.map((a) => a.id).join('|') ?? '';
  useEffect(() => {
    if (!open || !project) return undefined;
    let alive = true;
    void (async () => {
      const bytes = new Map<string, number>();
      await Promise.all(
        project.assets.map(async (ref) => {
          const blob = await assetStorage.getAssetBlob(ref.id).catch(() => null);
          if (blob) bytes.set(ref.id, blob.size);
        }),
      );
      if (!alive) return;
      const jsonBytes = JSON.stringify(project).length;
      setEnvelopeEstimate(estimateEnvelopeBytes(jsonBytes, bytes));
      setEnvelopeContributors(
        [...bytes.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .filter(([, size]) => size > 512 * 1024)
          .map(
            ([id, size]) =>
              `${project.assets.find((ref) => ref.id === id)?.name ?? id} (${(size / (1024 * 1024)).toFixed(1)} MB)`,
          ),
      );
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, assetSignature]);

  if (!project || !artboard) return null;

  const envelopeTooBig =
    envelopeEstimate !== null && envelopeEstimate > thresholds.maxEnvelopeBytes;

  const transparentSupported = format === 'png' || format === 'webp';
  const qualitySupported = format === 'jpeg' || format === 'webp';
  // A batch spanning multiple artboards and/or content locales is bundled into a
  // single .zip so the browser never suppresses the follow-up downloads.
  const totalOutputs = targets.length * localeTargets.length;
  const bundling = totalOutputs > 1;
  const filename = bundling
    ? `${slug(project.name)}.zip`
    : format === 'html'
      ? `${slug(project.name)}-${slug(artboard.name)}.html`
      : format === 'svg'
        ? `${slug(project.name)}-${slug(artboard.name)}.svg`
        : rasterFilename(project.name, artboard.name, format, pixelRatio);

  const renderRaster = (target: CalqoArtboard, fmt: RasterFormat, locale: LocaleCode) =>
    exportArtboardRaster({
      artboard: target,
      locale,
      format: fmt,
      pixelRatio,
      transparent: transparent && (fmt === 'png' || fmt === 'webp'),
      quality,
    });

  /**
   * Render one artboard at one content locale to a named file blob. When the
   * batch spans more than one locale, files are nested in a per-locale folder so
   * the same artboard's variants never collide inside the archive.
   */
  const renderTarget = async (
    target: CalqoArtboard,
    stem: string,
    locale: LocaleCode,
    notes: string[],
  ): Promise<{ name: string; blob: Blob }> => {
    const projectSlug = slug(project.name);
    const dir = localeTargets.length > 1 ? `${locale}/` : '';
    const scaleSuffix = pixelRatio > 1 ? `@${pixelRatio}x` : '';
    if (isRaster(format)) {
      const ext = format === 'jpeg' ? 'jpg' : format;
      const blob = await renderRaster(target, format, locale);
      return { name: `${dir}${projectSlug}-${stem}${scaleSuffix}.${ext}`, blob };
    }
    if (format === 'svg') {
      const { svg } = await exportArtboardSvg(target, locale);
      return {
        name: `${dir}${projectSlug}-${stem}.svg`,
        blob: new Blob([svg], { type: 'image/svg+xml' }),
      };
    }
    if (htmlKind === 'editable') {
      // Editable HTML: real text/CSS nodes from the document, with per-layer
      // raster fallbacks and grouped fidelity notes.
      const result = await exportArtboardHtmlLayout(target, locale, {
        title: `${project.name} — ${target.name}`,
      });
      notes.push(...result.warnings);
      return {
        name: `${dir}${projectSlug}-${stem}.html`,
        blob: new Blob([result.html], { type: 'text/html' }),
      };
    }
    // HTML (image wrapper) — always a PNG of the artboard.
    const blob = await renderRaster(target, 'png', locale);
    const pngDataUrl = await blobToDataUrl(blob);
    const html = (htmlMode === 'snippet' ? htmlSnippet : htmlStandalone)({
      title: `${project.name} — ${target.name}`,
      width: target.width,
      height: target.height,
      pngDataUrl,
    });
    return {
      name: `${dir}${projectSlug}-${stem}.html`,
      blob: new Blob([html], { type: 'text/html' }),
    };
  };

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    // Collision-free stems so a batch with duplicate artboard names never
    // overwrites earlier files (plan Phase K).
    const stems = uniqueArtboardStems(targets, slug);
    const total = totalOutputs;
    setProgress({ done: 0, total });
    // Fidelity notes accumulate across the whole batch (deduplicated), so a
    // multi-artboard export never shows only the last artboard's notes.
    const notes: string[] = [];
    setFidelityNotes([]);
    try {
      const outputs = [];
      for (const locale of localeTargets) {
        for (let i = 0; i < targets.length; i++) {
          outputs.push(await renderTarget(targets[i], stems[i], locale, notes));
          setProgress({ done: outputs.length, total });
        }
      }
      setFidelityNotes([...new Set(notes)]);
      if (outputs.length === 1) {
        await files.downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        // Bundle every artboard into one ZIP — a single download the browser
        // won't block, unlike a burst of per-file downloads.
        const entries = await Promise.all(
          outputs.map(async (o) => ({ name: o.name, data: await blobToBytes(o.blob) })),
        );
        await files.downloadBlob(createZip(entries), `${slug(project.name)}.zip`);
      }
      setStatus(t('export.done'));
    } catch (error) {
      console.error('[Calqo] export failed', error);
      setStatus(t('export.failed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleCopyImage = async () => {
    if (!isRaster(format)) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderRaster(artboard, 'png', project.activeContentLocale);
      const ok = await clipboard.writeImage(blob);
      setStatus(ok ? t('export.copied') : t('export.copyUnsupported'));
    } catch {
      setStatus(t('export.copyUnsupported'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyHtml = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderRaster(artboard, 'png', project.activeContentLocale);
      const pngDataUrl = await blobToDataUrl(blob);
      const html = htmlSnippet({
        title: `${project.name} — ${artboard.name}`,
        width: artboard.width,
        height: artboard.height,
        pngDataUrl,
      });
      const ok = await clipboard.writeText(html);
      setStatus(ok ? t('export.copied') : t('export.copyUnsupported'));
    } catch {
      setStatus(t('export.copyUnsupported'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      labelledBy="export-title"
      className="glass glass-strong w-[min(540px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="export-title" className="text-[16px] font-semibold text-[var(--calqo-text)]">
              {t('export.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t('export.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('export.close')} onClick={onClose}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="space-y-4">
          <Field label={t('export.format')}>
            <GlassSegmentedControl<Format>
              ariaLabel={t('export.format')}
              className="flex w-full [&>button]:flex-1"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPG' },
                { value: 'webp', label: 'WebP' },
                { value: 'svg', label: 'SVG' },
                { value: 'html', label: 'HTML' },
              ]}
            />
          </Field>

          {(isRaster(format) || format === 'html') && (
            <Field label={t('export.scale')}>
              <GlassSegmentedControl<Scale>
                ariaLabel={t('export.scale')}
                value={scale}
                onChange={setScale}
                options={[
                  { value: '1', label: '1x' },
                  { value: '2', label: '2x' },
                  { value: '3', label: '3x' },
                ]}
              />
            </Field>
          )}

          {transparentSupported && (
            <Field label={t('export.background')}>
              <GlassSegmentedControl<'normal' | 'transparent'>
                ariaLabel={t('export.background')}
                value={transparent ? 'transparent' : 'normal'}
                onChange={(value) => setTransparent(value === 'transparent')}
                options={[
                  { value: 'normal', label: t('export.bgNormal') },
                  { value: 'transparent', label: t('export.bgTransparent') },
                ]}
              />
            </Field>
          )}

          {qualitySupported && (
            <Field label={t('export.quality')}>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(quality * 100)}
                  onChange={(e) => setQuality(Number(e.target.value) / 100)}
                  className="flex-1 accent-[var(--calqo-accent)]"
                />
                <span className="mono w-9 text-right text-[11px] text-[var(--calqo-text-3)]">
                  {Math.round(quality * 100)}
                </span>
              </div>
            </Field>
          )}

          {format === 'html' && (
            <Field label={t('export.htmlKind')}>
              <GlassSegmentedControl<HtmlKind>
                ariaLabel={t('export.htmlKind')}
                value={htmlKind}
                onChange={setHtmlKind}
                options={[
                  { value: 'wrapper', label: t('export.htmlWrapper') },
                  { value: 'editable', label: t('export.htmlEditable') },
                ]}
              />
            </Field>
          )}

          {format === 'html' && htmlKind === 'editable' && (
            <p className="px-1 text-[11px] text-[var(--calqo-text-3)]">
              {t('export.htmlEditableHint')}
            </p>
          )}

          {format === 'html' && htmlKind === 'wrapper' && (
            <Field label={t('export.htmlMode')}>
              <GlassSegmentedControl<HtmlMode>
                ariaLabel={t('export.htmlMode')}
                value={htmlMode}
                onChange={setHtmlMode}
                options={[
                  { value: 'standalone', label: t('export.standalone') },
                  { value: 'snippet', label: t('export.snippet') },
                ]}
              />
            </Field>
          )}

          <Field label={t('export.scope')}>
            <GlassSegmentedControl<Scope>
              ariaLabel={t('export.scope')}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'active', label: t('export.activeArtboard') },
                { value: 'all', label: t('export.allArtboards', { count: project.artboards.length }) },
              ]}
            />
          </Field>

          {project.contentLocales.length > 1 && (
            <Field label={t('export.localeScope')}>
              <GlassSegmentedControl<Scope>
                ariaLabel={t('export.localeScope')}
                value={localeScope}
                onChange={setLocaleScope}
                options={[
                  {
                    value: 'active',
                    label: t('export.activeLocale', {
                      locale: localeLabel(project.activeContentLocale, i18n.language),
                    }),
                  },
                  {
                    value: 'all',
                    label: t('export.allLocales', { count: project.contentLocales.length }),
                  },
                ]}
              />
            </Field>
          )}

          <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2">
            <span className="text-[11px] text-[var(--calqo-text-3)]">{t('export.filename')}</span>
            <p className="mono mt-0.5 truncate text-[12px] text-[var(--calqo-text-2)]">{filename}</p>
          </div>

          {(warnings.length > 0 || envelopeTooBig || missingAssetCount > 0) && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-3 py-2">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#B7791F]">
                <AlertTriangle size={12} />
                {t('export.warnings')}
              </p>
              <ul className="space-y-0.5">
                {warnings.map((w) => (
                  <li key={w} className="text-[11px] text-[var(--calqo-text-2)]">
                    {w}
                  </li>
                ))}
                {envelopeTooBig && envelopeEstimate !== null && (
                  <li className="text-[11px] text-[var(--calqo-text-2)]">
                    {t('export.warnEnvelopeSize', {
                      size: (envelopeEstimate / (1024 * 1024)).toFixed(0),
                    })}
                  </li>
                )}
                {envelopeTooBig && envelopeContributors.length > 0 && (
                  <li className="text-[11px] text-[var(--calqo-text-2)]">
                    {t('export.warnEnvelopeContributors', {
                      names: envelopeContributors.join(', '),
                    })}
                  </li>
                )}
              </ul>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {missingAssetCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setRepairAssetsOpen(true)}
                    className="text-[11px] font-medium text-[var(--calqo-accent)] hover:underline"
                  >
                    {t('repairAssets.open')}
                  </button>
                )}
                {envelopeTooBig && (
                  <button
                    type="button"
                    onClick={() => setOptimizeAssetsOpen(true)}
                    className="text-[11px] font-medium text-[var(--calqo-accent)] hover:underline"
                  >
                    {t('optimizeAssets.open')}
                  </button>
                )}
              </div>
            </div>
          )}

          {fidelityNotes.length > 0 && format === 'html' && htmlKind === 'editable' && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold text-[var(--calqo-text-2)]">
                {t('export.fidelityNotes')}
              </p>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto calqo-scroll">
                {fidelityNotes.map((note) => (
                  <li key={note} className="text-[11px] text-[var(--calqo-text-3)]">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--calqo-text-3)]">
            {status && <Check size={13} className="text-[var(--calqo-accent)]" />}
            {status}
          </span>
          <div className="flex items-center gap-2">
            {isRaster(format) && (
              <GlassButton onClick={handleCopyImage} disabled={busy}>
                <Copy size={14} />
                {t('export.copyImage')}
              </GlassButton>
            )}
            {format === 'html' && htmlKind === 'wrapper' && (
              <GlassButton onClick={handleCopyHtml} disabled={busy}>
                <Copy size={14} />
                {t('export.copySnippet')}
              </GlassButton>
            )}
            <GlassButton
              variant="primary"
              onClick={handleExport}
              disabled={busy}
              loading={busy}
            >
              {!busy && <Download size={14} />}
              {busy
                ? progress && progress.total > 1
                  ? t('export.workingCount', { done: progress.done, total: progress.total })
                  : t('export.working')
                : t('export.download')}
            </GlassButton>
          </div>
        </footer>
    </ModalOverlay>
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

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'calqo'
  );
}
