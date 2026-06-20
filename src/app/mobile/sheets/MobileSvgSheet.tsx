import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Search, Sparkles, Upload } from 'lucide-react';
import { assetStorage, clipboard } from '@/lib/adapters';
import { generateSvgMark } from '@/editor/ai/svgService';
import { getProvider } from '@/editor/ai/providerRegistry';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import { addImportedAssetLayer } from '@/editor/commands/projectCommands';
import {
  SVG_CATEGORY_ORDER,
  SVG_LIBRARY,
  type SvgLibraryItem,
} from '@/editor/assets/svgLibrary';
import { extractSvgSize, looksLikeSvg, recolorSvg, sanitizeSvg } from '@/lib/utils/svg';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { BottomSheet } from '@/components/mobile';
import { GlassButton } from '@/components/glass';
import { cn } from '@/lib/utils/cn';

type Tab = 'library' | 'ai' | 'upload';

interface MobileSvgSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
  artboard: CalqoArtboard;
}

function ColorInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const safeValue = /^#[0-9a-f]{6}$/i.test(value) ? value : '#111827';
  return (
    <label className="flex items-center gap-2 text-[12px] text-[var(--calqo-text-2)]">
      {label}
      <input
        type="color"
        value={safeValue}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-8 rounded-[10px] border border-[var(--calqo-divider)] bg-transparent p-0.5"
      />
      <span className="mono text-[10.5px] uppercase text-[var(--calqo-text-3)]">
        {safeValue}
      </span>
    </label>
  );
}

/** Compact phone version of the desktop SVG picker: bundled library, AI
 * generation, and local SVG upload, all inserting sanitized SVG assets. */
export function MobileSvgSheet({
  open,
  onClose,
  project,
  artboard,
}: MobileSvgSheetProps) {
  const { t } = useTranslation('editor');
  const settings = useAiSettingsStore((s) => s.settings);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('library');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState(project.palette[0] ?? '#111827');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insertSvg = async (svg: string, name: string, tint?: string) => {
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
    addImportedAssetLayer(
      project.id,
      asset,
      artboard.width / 2 - w / 2,
      artboard.height / 2 - h / 2,
      tint,
    );
    onClose();
  };

  const runAi = async () => {
    if (!aiPrompt.trim()) return;
    setBusy(true);
    setError(null);
    setAiPreview(null);
    try {
      const provider = getProvider(settings);
      const result = await generateSvgMark(provider, {
        prompt: aiPrompt.trim(),
        color,
      });
      if (result.ok) setAiPreview(result.svg);
      else setError(result.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File) => {
    setError(null);
    const svg = sanitizeSvg(await file.text());
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
        onClick={() => void insertSvg(item.svg, name, color)}
        className="group flex min-w-0 flex-col items-center gap-1.5"
      >
        <span
          className="flex aspect-square w-full items-center justify-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-white p-3 transition-colors group-active:border-[var(--calqo-accent)]"
          dangerouslySetInnerHTML={{ __html: recolorSvg(item.svg, color) }}
        />
        <span className="w-full truncate text-center text-[10.5px] leading-tight text-[var(--calqo-text-3)]">
          {name}
        </span>
      </button>
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'library', label: t('svgLibrary.tabLibrary') },
    { id: 'ai', label: t('svgLibrary.tabAi') },
    { id: 'upload', label: t('svgLibrary.tabUpload') },
  ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('svgLibrary.title')}
      subtitle={t('svgLibrary.subtitle')}
      bodyClassName="pb-4"
      footer={
        tab === 'ai' ? (
          <GlassButton
            variant="primary"
            className="w-full"
            onClick={runAi}
            disabled={busy || !aiPrompt.trim()}
          >
            <Sparkles size={15} />
            {busy ? t('svgLibrary.generating') : t('svgLibrary.generate')}
          </GlassButton>
        ) : undefined
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-glass-thin)] p-1">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setTab(entry.id);
              setError(null);
            }}
            className={cn(
              'rounded-[8px] py-2 text-[12px] font-medium transition-colors',
              tab === entry.id
                ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
                : 'text-[var(--calqo-text-2)]',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'library' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--calqo-text-3)]"
              />
              <input
                type="search"
                value={search}
                placeholder={t('svgLibrary.search')}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] pl-9 pr-3 text-[13px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
              />
            </label>
          </div>
          <ColorInput value={color} onChange={setColor} label={t('svgLibrary.color')} />

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
                <div className="grid grid-cols-4 gap-2.5">
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
            className="min-h-24 w-full resize-y rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 py-2.5 text-[13px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
          />
          <ColorInput value={color} onChange={setColor} label={t('svgLibrary.color')} />
          {aiPreview && (
            <div className="flex items-center gap-3 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] p-3">
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] bg-white p-2"
                dangerouslySetInnerHTML={{ __html: aiPreview }}
              />
              <GlassButton
                variant="primary"
                className="min-w-0 flex-1"
                onClick={() =>
                  void insertSvg(aiPreview, aiPrompt.slice(0, 32) || 'AI SVG', color)
                }
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
            className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-[var(--calqo-radius-md)] border border-dashed border-[var(--calqo-divider)] text-[12.5px] text-[var(--calqo-text-2)] active:bg-[var(--calqo-hover)]"
          >
            <Upload size={22} />
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
              className="ml-2 inline-flex items-center gap-1 text-[var(--calqo-accent)]"
            >
              <Copy size={11} />
              {t('promptTemplate.copyRaw')}
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
