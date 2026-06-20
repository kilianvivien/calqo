import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Share2 } from 'lucide-react';
import { files } from '@/lib/adapters';
import {
  exportArtboardRaster,
  rasterFilename,
} from '@/editor/export/rasterExport';
import { canShareFiles, shareArtboardPng } from '@/editor/export/share';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { BottomSheet } from '@/components/mobile';
import { GlassButton } from '@/components/glass';
import { cn } from '@/lib/utils/cn';

interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
  artboard: CalqoArtboard;
}

const SCALES = [1, 2, 3] as const;
type Scale = (typeof SCALES)[number];

/** Phone export & share: render the active artboard to PNG and hand it to the
 * native share sheet (camera roll, messaging) with a download fallback when the
 * Web Share API is unavailable (PRD §5.9 "export & share"). */
export function ExportSheet({ open, onClose, project, artboard }: ExportSheetProps) {
  const { t } = useTranslation('editor');
  const [scale, setScale] = useState<Scale>(2);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const renderBlob = () =>
    exportArtboardRaster({
      artboard,
      locale: project.activeContentLocale,
      format: 'png',
      pixelRatio: scale,
      transparent,
    });

  const share = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await shareArtboardPng(project, artboard);
      setStatus(
        outcome === 'shared' ? t('mobile.export.shared') : t('mobile.export.downloaded'),
      );
    } catch (error) {
      console.error('[Calqo] mobile share failed', error);
      setStatus(t('mobile.export.failed'));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderBlob();
      await files.downloadBlob(
        blob,
        rasterFilename(project.name, artboard.name, 'png', scale),
      );
      setStatus(t('mobile.export.downloaded'));
    } catch (error) {
      console.error('[Calqo] mobile export failed', error);
      setStatus(t('mobile.export.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.export.title')}
      subtitle={artboard.name}
      bodyClassName="pb-4"
    >
      <section className="py-2">
        <p className="mb-2 text-[12px] font-medium text-[var(--calqo-text-2)]">
          {t('mobile.export.scale')}
        </p>
        <div className="flex gap-1.5">
          {SCALES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScale(value)}
              className={cn(
                'flex-1 rounded-[var(--calqo-radius-sm)] border py-2.5 text-[13px] font-medium transition-colors',
                scale === value
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
                  : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)]',
              )}
            >
              {value}×
            </button>
          ))}
        </div>
      </section>

      <label className="flex items-center justify-between py-3">
        <span className="text-[13px] text-[var(--calqo-text)]">
          {t('mobile.export.transparent')}
        </span>
        <input
          type="checkbox"
          checked={transparent}
          onChange={(event) => setTransparent(event.target.checked)}
          className="h-5 w-5 accent-[var(--calqo-accent)]"
        />
      </label>

      <div className="mt-2 flex flex-col gap-2">
        {canShareFiles() && (
          <GlassButton variant="primary" className="w-full" onClick={share} disabled={busy}>
            <Share2 size={15} />
            {t('mobile.export.share')}
          </GlassButton>
        )}
        <GlassButton className="w-full" onClick={download} disabled={busy}>
          <Download size={15} />
          {t('mobile.export.download')}
        </GlassButton>
      </div>

      {status && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[var(--calqo-text-3)]">
          <Check size={13} className="text-[var(--calqo-accent)]" />
          {status}
        </p>
      )}
    </BottomSheet>
  );
}
