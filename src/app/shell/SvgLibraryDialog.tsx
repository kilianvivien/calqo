import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Sparkles, Upload, X } from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { assetStorage, clipboard } from '@/lib/adapters';
import { addImportedAssetLayer, setListMarker } from '@/editor/commands/projectCommands';
import { generateSvgMark } from '@/editor/ai/svgService';
import { getProvider } from '@/editor/ai/providerRegistry';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import {
  SVG_CATEGORY_ORDER,
  SVG_LIBRARY,
  type SvgLibraryItem,
} from '@/editor/assets/svgLibrary';
import { extractSvgSize, looksLikeSvg, recolorSvg, sanitizeSvg } from '@/lib/utils/svg';
import { ColorSwatchButton } from './inspector/ColorSwatchButton';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';

type Tab = 'library' | 'ai' | 'upload';

export function SvgLibraryDialog() {
  const open = useUiStore((s) => s.svgDialog);
  if (!open) return null;
  return <SvgLibraryDialogInner />;
}

function SvgLibraryDialogInner() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const settings = useAiSettingsStore((s) => s.settings);
  const setSvgDialog = useUiStore((s) => s.setSvgDialog);
  const markerPickerLayerId = useUiStore((s) => s.markerPickerLayerId);
  const setMarkerPickerLayerId = useUiStore((s) => s.setMarkerPickerLayerId);
  const close = () => {
    setSvgDialog(false);
    setMarkerPickerLayerId(null);
  };

  const [tab, setTab] = useState<Tab>('library');
  const [search, setSearch] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiColor, setAiColor] = useState(project?.palette[0] ?? '#111827');
  const [libColor, setLibColor] = useState(project?.palette[0] ?? '#111827');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertSvg = async (svg: string, name: string, color?: string) => {
    if (!project) return;
    const { width, height } = extractSvgSize(svg);
    const ratio = width / height;
    const w = ratio >= 1 ? 240 : 240 * ratio;
    const h = ratio >= 1 ? 240 / ratio : 240;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const asset = await assetStorage.saveAsset(project.id, blob, {
      kind: 'svg',
      name,
      mimeType: 'image/svg+xml',
      width: Math.round(w),
      height: Math.round(h),
    });
    if (markerPickerLayerId) {
      setListMarker(
        project.id,
        markerPickerLayerId,
        { kind: 'asset', assetId: asset.id, color: color ?? '#111827' },
        asset,
      );
    } else if (artboard) {
      addImportedAssetLayer(
        project.id,
        asset,
        (artboard.width - w) / 2,
        (artboard.height - h) / 2,
        color,
      );
    }
    close();
  };

  const runAi = async () => {
    if (!aiPrompt.trim()) return;
    setBusy(true);
    setError(null);
    setAiPreview(null);
    try {
      const provider = getProvider(settings);
      const result = await generateSvgMark(provider, { prompt: aiPrompt.trim(), color: aiColor });
      if (result.ok) setAiPreview(result.svg);
      else setError(result.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File) => {
    const text = await file.text();
    const svg = sanitizeSvg(text);
    if (!looksLikeSvg(svg)) {
      setError(t('svgLibrary.invalidFile'));
      return;
    }
    await insertSvg(svg, file.name.replace(/\.svg$/i, '') || 'SVG');
  };

  const filtered = search.trim()
    ? SVG_LIBRARY.filter((item) =>
        (t(`svgLibrary.items.${item.nameKey}`) + ' ' + item.keywords)
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : SVG_LIBRARY;

  // Group the (filtered) marks into their categories, preserving section order.
  const sections = SVG_CATEGORY_ORDER.map((category) => ({
    category,
    items: filtered.filter((item) => item.category === category),
  })).filter((section) => section.items.length > 0);

  const renderItem = (item: SvgLibraryItem) => {
    const name = t(`svgLibrary.items.${item.nameKey}`);
    return (
      <button
        key={item.id}
        type="button"
        title={name}
        onClick={() => void insertSvg(item.svg, name, libColor)}
        className="group flex flex-col items-center gap-1.5"
      >
        <span
          className="flex aspect-square w-full items-center justify-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-white p-3 transition-all group-hover:-translate-y-0.5 group-hover:border-[var(--calqo-accent)] group-hover:shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
          // Library SVGs are bundled and trusted; recoloured for preview.
          dangerouslySetInnerHTML={{ __html: recolorSvg(item.svg, libColor) }}
        />
        <span className="w-full truncate text-center text-[10.5px] leading-tight text-[var(--calqo-text-3)] group-hover:text-[var(--calqo-text-2)]">
          {name}
        </span>
      </button>
    );
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'library', label: t('svgLibrary.tabLibrary') },
    { id: 'ai', label: t('svgLibrary.tabAi') },
    { id: 'upload', label: t('svgLibrary.tabUpload') },
  ];

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
        aria-labelledby="svg-library-title"
        className="glass glass-strong flex max-h-[80vh] w-[min(620px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="svg-library-title"
              className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
            >
              <Sparkles size={17} className="text-[var(--calqo-accent)]" />
              {markerPickerLayerId ? t('list.pickAsset') : t('svgLibrary.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {markerPickerLayerId
                ? t('list.markerAsset')
                : t('svgLibrary.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('export.close')} onClick={close}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="mb-3 flex gap-1 rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-glass-thin)] p-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTab(entry.id);
                setError(null);
              }}
              className={[
                'flex-1 rounded-[8px] py-1.5 text-[12.5px] transition-colors',
                tab === entry.id
                  ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                  : 'text-[var(--calqo-text-2)] hover:text-[var(--calqo-text)]',
              ].join(' ')}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto calqo-scroll">
          {tab === 'library' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={search}
                  placeholder={t('svgLibrary.search')}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[12.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
                />
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--calqo-text-2)]">
                  {t('svgLibrary.color')}
                  <ColorSwatchButton
                    value={/^#[0-9a-f]{6}$/i.test(libColor) ? libColor : '#111827'}
                    onChange={setLibColor}
                    label={t('svgLibrary.color')}
                    size={26}
                  />
                </span>
              </div>
              {sections.length === 0 ? (
                <p className="py-8 text-center text-[12.5px] text-[var(--calqo-text-3)]">
                  {t('svgLibrary.noResults')}
                </p>
              ) : (
                sections.map((section) => (
                  <section key={section.category} className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--calqo-text-3)]">
                      {t(`svgLibrary.categories.${section.category}`)}
                    </h3>
                    <div className="grid grid-cols-5 gap-2.5">
                      {section.items.map(renderItem)}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={aiPrompt}
                placeholder={t('svgLibrary.aiPlaceholder')}
                onChange={(event) => setAiPrompt(event.target.value)}
                className="min-h-20 w-full resize-y rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 py-2.5 text-[13px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
              />
              <div className="flex items-center gap-2 text-[12px] text-[var(--calqo-text-2)]">
                <span>{t('svgLibrary.color')}</span>
                <ColorSwatchButton
                  value={/^#[0-9a-f]{6}$/i.test(aiColor) ? aiColor : '#111827'}
                  onChange={setAiColor}
                  label={t('svgLibrary.color')}
                  size={26}
                />
                <span className="mono text-[11px] uppercase tracking-wide text-[var(--calqo-text-3)]">
                  {aiColor}
                </span>
              </div>
              {aiPreview && (
                <div className="flex items-center gap-3 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] p-3">
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-[var(--calqo-radius-sm)] bg-white p-2"
                    // Sanitised by generateSvgMark before display.
                    dangerouslySetInnerHTML={{ __html: aiPreview }}
                  />
                  <GlassButton
                    variant="primary"
                    onClick={() => void insertSvg(aiPreview, aiPrompt.slice(0, 32) || 'AI SVG', aiColor)}
                  >
                    {t('svgLibrary.insert')}
                  </GlassButton>
                </div>
              )}
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              <input
                ref={uploadRef}
                type="file"
                accept="image/svg+xml,.svg"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUpload(file);
                  event.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-[var(--calqo-radius-md)] border border-dashed border-[var(--calqo-divider)] text-[12.5px] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)]"
              >
                <Upload size={20} />
                {t('svgLibrary.uploadHint')}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-[var(--calqo-radius-sm)] border border-[#FF5F57]/40 bg-[#FF5F57]/10 p-2.5 text-[11.5px] text-[#B42318]">
              {error}
              {tab === 'ai' && (
                <button
                  type="button"
                  onClick={() => void clipboard.writeText(error)}
                  className="ml-2 inline-flex items-center gap-1 text-[var(--calqo-accent)] hover:underline"
                >
                  <Copy size={11} />
                  {t('promptTemplate.copyRaw')}
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="mt-4 flex items-center justify-end gap-2">
          <GlassButton onClick={close}>{t('export.close')}</GlassButton>
          {tab === 'ai' && (
            <GlassButton variant="primary" onClick={runAi} disabled={busy || !aiPrompt.trim()}>
              <Sparkles size={14} />
              {busy ? t('svgLibrary.generating') : t('svgLibrary.generate')}
            </GlassButton>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
