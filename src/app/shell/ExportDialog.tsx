import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Download, X } from 'lucide-react';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
} from '@/components/glass';
import { clipboard, files } from '@/lib/adapters';
import { artboardOverflowLayerIds } from '@/editor/commands/projectCommands';
import {
  exportArtboardRaster,
  rasterFilename,
  type RasterFormat,
} from '@/editor/export/rasterExport';
import { exportArtboardSvg } from '@/editor/export/svgExport';
import { htmlSnippet, htmlStandalone } from '@/editor/export/htmlExport';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const warnings = useMemo(() => collectWarnings(project, targets, t), [project, targets, t]);

  if (!open || !project || !artboard) return null;

  const transparentSupported = format === 'png' || format === 'webp';
  const qualitySupported = format === 'jpeg' || format === 'webp';
  const filename =
    format === 'html'
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

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (isRaster(format)) {
        for (const target of targets) {
          const blob = await renderRaster(target, format);
          await files.downloadBlob(
            blob,
            rasterFilename(project.name, target.name, format, pixelRatio),
          );
          if (targets.length > 1) await delay(250);
        }
      } else if (format === 'svg') {
        for (const target of targets) {
          const { svg } = await exportArtboardSvg(target, project.activeContentLocale);
          await files.downloadBlob(
            new Blob([svg], { type: 'image/svg+xml' }),
            `${slug(project.name)}-${slug(target.name)}.svg`,
          );
          if (targets.length > 1) await delay(250);
        }
      } else {
        // HTML wrapper — always a PNG of the chosen scope's artboards.
        for (const target of targets) {
          const blob = await renderRaster(target, 'png');
          const pngDataUrl = await blobToDataUrl(blob);
          const input = {
            title: `${project.name} — ${target.name}`,
            width: target.width,
            height: target.height,
            pngDataUrl,
          };
          const html = htmlMode === 'snippet' ? htmlSnippet(input) : htmlStandalone(input);
          await files.downloadBlob(
            new Blob([html], { type: 'text/html' }),
            `${slug(project.name)}-${slug(target.name)}.html`,
          );
          if (targets.length > 1) await delay(250);
        }
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.45)] p-6 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
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
      </section>
    </div>,
    document.body,
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

/** Per-artboard fit/missing-asset warnings shown before export (plan §11.4). */
function collectWarnings(
  project: CalqoProject | null,
  targets: CalqoArtboard[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string[] {
  if (!project) return [];
  const messages: string[] = [];
  const assetIds = new Set(project.assets.map((a) => a.id));
  for (const artboard of targets) {
    if (artboardOverflowLayerIds(artboard).length > 0) {
      messages.push(t('export.warnOverflow', { name: artboard.name }));
    }
    const missing = artboard.layers.some(
      (layer) =>
        (layer.type === 'image' || layer.type === 'svg') && !assetIds.has(layer.assetId),
    );
    if (missing) messages.push(t('export.warnMissingAsset', { name: artboard.name }));
  }
  return [...new Set(messages)];
}
