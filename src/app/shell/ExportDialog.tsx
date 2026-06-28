import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Download, X } from 'lucide-react';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
  ModalOverlay,
} from '@/components/glass';
import { clipboard, files } from '@/lib/adapters';
import {
  exportArtboardRaster,
  rasterFilename,
  type RasterFormat,
} from '@/editor/export/rasterExport';
import { exportArtboardSvg } from '@/editor/export/svgExport';
import { htmlSnippet, htmlStandalone } from '@/editor/export/htmlExport';
import { blobToBytes, createZip } from '@/editor/export/zip';
import {
  collectExportWarnings,
  uniqueArtboardStems,
} from '@/editor/export/exportReadiness';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import type { CalqoArtboard } from '@/lib/schema';

type Format = RasterFormat | 'svg' | 'html';
type Scope = 'active' | 'all';
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
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const [format, setFormat] = useState<Format>('png');
  const [scale, setScale] = useState<Scale>('2');
  const pixelRatio = Number(scale) as 1 | 2 | 3;
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(0.92);
  const [scope, setScope] = useState<Scope>('active');
  const [htmlMode, setHtmlMode] = useState<HtmlMode>('standalone');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const targets = useMemo<CalqoArtboard[]>(() => {
    if (!project || !artboard) return [];
    return scope === 'all' ? project.artboards : [artboard];
  }, [project, artboard, scope]);

  const warnings = useMemo(
    () =>
      collectExportWarnings({ project, targets, exportingAll: scope === 'all' }, t),
    [project, targets, scope, t],
  );

  if (!project || !artboard) return null;

  const transparentSupported = format === 'png' || format === 'webp';
  const qualitySupported = format === 'jpeg' || format === 'webp';
  // A multi-artboard export is bundled into a single .zip so the browser never
  // suppresses the follow-up downloads.
  const bundling = targets.length > 1;
  const filename = bundling
    ? `${slug(project.name)}.zip`
    : format === 'html'
      ? `${slug(project.name)}-${slug(artboard.name)}.html`
      : format === 'svg'
        ? `${slug(project.name)}-${slug(artboard.name)}.svg`
        : rasterFilename(project.name, artboard.name, format, pixelRatio);

  const renderRaster = (target: CalqoArtboard, fmt: RasterFormat) =>
    exportArtboardRaster({
      artboard: target,
      locale: project.activeContentLocale,
      format: fmt,
      pixelRatio,
      transparent: transparent && (fmt === 'png' || fmt === 'webp'),
      quality,
    });

  /** Render one artboard to a named file blob for the current format. */
  const renderTarget = async (
    target: CalqoArtboard,
    stem: string,
  ): Promise<{ name: string; blob: Blob }> => {
    const projectSlug = slug(project.name);
    const scaleSuffix = pixelRatio > 1 ? `@${pixelRatio}x` : '';
    if (isRaster(format)) {
      const ext = format === 'jpeg' ? 'jpg' : format;
      const blob = await renderRaster(target, format);
      return { name: `${projectSlug}-${stem}${scaleSuffix}.${ext}`, blob };
    }
    if (format === 'svg') {
      const { svg } = await exportArtboardSvg(target, project.activeContentLocale);
      return {
        name: `${projectSlug}-${stem}.svg`,
        blob: new Blob([svg], { type: 'image/svg+xml' }),
      };
    }
    // HTML wrapper — always a PNG of the artboard.
    const blob = await renderRaster(target, 'png');
    const pngDataUrl = await blobToDataUrl(blob);
    const html = (htmlMode === 'snippet' ? htmlSnippet : htmlStandalone)({
      title: `${project.name} — ${target.name}`,
      width: target.width,
      height: target.height,
      pngDataUrl,
    });
    return {
      name: `${projectSlug}-${stem}.html`,
      blob: new Blob([html], { type: 'text/html' }),
    };
  };

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    // Collision-free stems so a batch with duplicate artboard names never
    // overwrites earlier files (plan Phase K).
    const stems = uniqueArtboardStems(targets, slug);
    try {
      const outputs = [];
      for (let i = 0; i < targets.length; i++) {
        outputs.push(await renderTarget(targets[i], stems[i]));
      }
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
    }
  };

  const handleCopyImage = async () => {
    if (!isRaster(format)) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderRaster(artboard, 'png');
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
      const blob = await renderRaster(artboard, 'png');
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

          <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2">
            <span className="text-[11px] text-[var(--calqo-text-3)]">{t('export.filename')}</span>
            <p className="mono mt-0.5 truncate text-[12px] text-[var(--calqo-text-2)]">{filename}</p>
          </div>

          {warnings.length > 0 && (
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
            {format === 'html' && (
              <GlassButton onClick={handleCopyHtml} disabled={busy}>
                <Copy size={14} />
                {t('export.copySnippet')}
              </GlassButton>
            )}
            <GlassButton variant="primary" onClick={handleExport} disabled={busy}>
              <Download size={14} />
              {busy ? t('export.working') : t('export.download')}
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
